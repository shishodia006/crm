import { one, q, run } from '../db/pool.js';
import { updateById } from '../db/pool.js';
import { config } from '../config/index.js';
import { addScoreEvent } from './score.service.js';
import { sendCommunication } from './comm.service.js';

export async function enrollLead(leadId, campaignId, conn = undefined) {
  const { pool } = await import('../db/pool.js');
  const db = conn || pool;
  const existing = await one(
    'SELECT id,status,enrolled_at,completed_at FROM lead_enrollments WHERE lead_id=? AND campaign_id=? LIMIT 1',
    [leadId, campaignId], db
  );
  if (existing && ['active', 'paused'].includes(existing.status)) return false;

  const campaign = await one('SELECT entry_rules FROM campaigns WHERE id=? LIMIT 1', [campaignId], db);
  let entryRules = {};
  try { entryRules = JSON.parse(campaign?.entry_rules || '{}'); } catch {}
  if (existing && entryRules.reentry === 'never') return false;
  if (existing && entryRules.reentry === 'after_days') {
    const days = Math.max(1, Number(entryRules.reentry_after_days || 0));
    const completedAt = new Date(existing.completed_at || existing.enrolled_at);
    if (Number.isFinite(completedAt.getTime()) && Date.now() < completedAt.getTime() + days * 86400000) return false;
  }

  const lead = await one('SELECT * FROM leads WHERE id=? LIMIT 1', [leadId], db);
  if (!lead || Number(lead.do_not_contact) || ['won', 'lost', 'unsubscribed', 'invalid'].includes(lead.status)) return false;

  const first = await one(
    'SELECT id FROM workflow_steps WHERE campaign_id=? AND parent_id IS NULL ORDER BY step_order ASC LIMIT 1',
    [campaignId], db
  );
  if (!first) return false;
  const nextExecuteAt = await computeNextExecuteAt(first.id, db);
  let enrollmentId;
  if (existing) {
    await run(
      "UPDATE lead_enrollments SET status='active', current_step_id=?, next_execute_at=?, enrolled_at=NOW(), exit_reason=NULL WHERE id=?",
      [first.id, nextExecuteAt, existing.id], db
    );
    enrollmentId = existing.id;
  } else {
    const result = await run(
      "INSERT INTO lead_enrollments (lead_id,campaign_id,current_step_id,status,next_execute_at) VALUES (?,?,?,'active',?)",
      [leadId, campaignId, first.id, nextExecuteAt], db
    );
    enrollmentId = Number(result.insertId);
  }
  await run('INSERT IGNORE INTO enrollment_step_logs (enrollment_id,step_id,status) VALUES (?,?,?)', [enrollmentId, first.id, 'pending'], db);
  return true;
}

export async function computeNextExecuteAt(stepId, conn = undefined) {
  const { pool } = await import('../db/pool.js');
  const db = conn || pool;
  const step = await one(
    `SELECT ws.type,ws.delay_value,ws.delay_unit,c.entry_rules
     FROM workflow_steps ws JOIN campaigns c ON c.id=ws.campaign_id WHERE ws.id=? LIMIT 1`, [stepId], db
  );
  const amount = Number(step?.delay_value || 0);
  if (!step || amount <= 0) return applyQuietHours(new Date(), step?.entry_rules);
  const date = new Date();
  if (step.delay_unit === 'minutes') date.setMinutes(date.getMinutes() + amount);
  else if (step.delay_unit === 'hours')  date.setHours(date.getHours() + amount);
  else                                   date.setDate(date.getDate() + amount);
  return applyQuietHours(date, step.entry_rules);
}

function applyQuietHours(date, rawRules) {
  let rules = {};
  try { rules = typeof rawRules === 'string' ? JSON.parse(rawRules || '{}') : (rawRules || {}); } catch {}
  const quiet = rules.quiet_hours;
  if (!quiet?.enabled || !/^\d{2}:\d{2}$/.test(quiet.start || '') || !/^\d{2}:\d{2}$/.test(quiet.end || '')) return date;
  const [startHour, startMin] = quiet.start.split(':').map(Number);
  const [endHour, endMin] = quiet.end.split(':').map(Number);
  const current = date.getHours() * 60 + date.getMinutes();
  const start = startHour * 60 + startMin;
  const end = endHour * 60 + endMin;
  const withinQuiet = start === end ? false : start < end ? current >= start && current < end : current >= start || current < end;
  if (!withinQuiet) return date;
  const next = new Date(date);
  next.setHours(endHour, endMin, 0, 0);
  if (start > end && current >= start) next.setDate(next.getDate() + 1);
  return next;
}

export async function processDue(batchSize = config.dripBatchSize) {
  const stats = { processed: 0, errors: 0, skipped: 0 };
  const enrollments = await q(
    `SELECT le.id AS enrollment_id, le.lead_id, le.campaign_id, le.current_step_id, le.next_execute_at
     FROM lead_enrollments le
     WHERE le.status='active' AND le.next_execute_at <= NOW()
     ORDER BY le.next_execute_at ASC LIMIT ${Number(batchSize)}`
  );
  for (const enrollment of enrollments) {
    try {
      await executeWorkflowStep(enrollment);
      stats.processed += 1;
    } catch (error) {
      stats.errors += 1;
      console.error(`DripEngine error enrollment #${enrollment.enrollment_id}:`, error.message);
    }
  }
  return stats;
}

// Max steps to auto-chain in a single drip run (prevents infinite loops)
const MAX_CHAIN = 25;

export async function executeWorkflowStep(enrollment, depth = 0) {
  if (depth >= MAX_CHAIN) return; // safety valve

  const step = await one('SELECT * FROM workflow_steps WHERE id=? LIMIT 1', [enrollment.current_step_id]);
  if (!step) {
    await run("UPDATE lead_enrollments SET status='completed', exit_reason='step_not_found', completed_at=NOW() WHERE id=?", [enrollment.enrollment_id]);
    return;
  }
  const lead = await one('SELECT * FROM leads WHERE id=? LIMIT 1', [enrollment.lead_id]);
  if (!lead || Number(lead.do_not_contact) || lead.status === 'unsubscribed') {
    await run("UPDATE lead_enrollments SET status='exited', exit_reason='lead_dnc_or_unsubscribed', completed_at=NOW() WHERE id=?", [enrollment.enrollment_id]);
    return;
  }
  if (await hasReachedCampaignGoal(enrollment.campaign_id, enrollment.enrollment_id, lead)) {
    await run("UPDATE lead_enrollments SET status='converted', exit_reason='campaign_goal_reached', completed_at=NOW() WHERE id=?", [enrollment.enrollment_id]);
    return;
  }

  let result = { executed_at: new Date().toISOString() };
  let ad = {};
  try { ad = typeof step.action_data === 'string' ? JSON.parse(step.action_data || '{}') : (step.action_data || {}); } catch {}

  let template = step.template_id ? await one("SELECT * FROM templates WHERE id=? AND status='active' LIMIT 1", [step.template_id]) : null;
  let abVariant = 'A';
  if (ad.ab_template_id) {
    const variantB = await one("SELECT * FROM templates WHERE id=? AND status='active' LIMIT 1", [Number(ad.ab_template_id)]);
    const winningTemplateId = variantB ? await chooseAbWinner(step.id, template?.id, variantB.id) : null;
    if (variantB && (winningTemplateId === Number(variantB.id) || (!winningTemplateId && Number(enrollment.enrollment_id) % 2 === 0))) {
      template = variantB; abVariant = winningTemplateId ? 'B (winner)' : 'B';
    } else if (winningTemplateId) {
      abVariant = 'A (winner)';
    }
  }

  if (['send_email', 'email'].includes(step.type)) {
    result = await sendWithFallback('email', lead, template, enrollment, step, ad, []);
    result.ab_variant = abVariant;

  } else if (['send_whatsapp', 'whatsapp'].includes(step.type)) {
    result = await sendWithFallback('whatsapp', lead, template, enrollment, step, ad, ['rcs', 'sms']);
    result.ab_variant = abVariant;

  } else if (['send_rcs', 'rcs'].includes(step.type)) {
    result = await sendWithFallback('rcs', lead, template, enrollment, step, ad, ['sms']);
    result.ab_variant = abVariant;

  } else if (['send_sms', 'sms'].includes(step.type)) {
    result = await sendWithFallback('sms', lead, template, enrollment, step, ad, []);
    result.ab_variant = abVariant;

  // ── Multi-channel: sends all selected channels at once ────────────────
  } else if (step.type === 'multi_send') {
    const sends = [];
    if (ad.email_template_id) {
      const t = await one("SELECT * FROM templates WHERE id=? AND status='active' LIMIT 1", [ad.email_template_id]);
      if (t) sends.push(sendCommunication('email', lead, t, enrollment.enrollment_id, step.id));
    }
    if (ad.whatsapp_template_id) {
      const t = await one("SELECT * FROM templates WHERE id=? AND status='active' LIMIT 1", [ad.whatsapp_template_id]);
      if (t) sends.push(sendCommunication('whatsapp', lead, t, enrollment.enrollment_id, step.id));
    }
    if (ad.rcs_template_id) {
      const t = await one("SELECT * FROM templates WHERE id=? AND status='active' LIMIT 1", [ad.rcs_template_id]);
      if (t) sends.push(sendCommunication('rcs', lead, t, enrollment.enrollment_id, step.id));
    }
    if (ad.sms_template_id) {
      const t = await one("SELECT * FROM templates WHERE id=? AND status='active' LIMIT 1", [ad.sms_template_id]);
      if (t) sends.push(sendCommunication('sms', lead, t, enrollment.enrollment_id, step.id));
    }
    const results = await Promise.all(sends);
    result.multi = results;

  } else if (step.type === 'condition') {
    const nextStepId = (await evaluateCondition(step, lead, ad, enrollment)) ? step.yes_next_id : step.no_next_id;
    await advanceEnrollment(enrollment.enrollment_id, nextStepId, result, depth);
    return;

  } else if (['assign_agent'].includes(step.type)) {
    await assignAgentToLead(lead.id, step.action_data);
  } else if (['create_task', 'task'].includes(step.type)) {
    await createWorkflowTask(lead.id, step.action_data);
  } else if (step.type === 'update_score') {
    await addScoreEvent(lead.id, ad.event || 'workflow_action');
  } else if (step.type === 'move_pipeline') {
    await createWorkflowDeal(lead.id, enrollment.campaign_id, step.action_data);
  } else if (step.type === 'tag_lead') {
    await applyTagToLead(lead.id, ad.tag_name);
  } else if (step.type === 'exit') {
    await run("UPDATE lead_enrollments SET status='completed', exit_reason='workflow_completed', completed_at=NOW() WHERE id=?", [enrollment.enrollment_id]);
    return;
  }
  // 'wait' type: no action — just advances with its own delay set by computeNextExecuteAt

  await run(
    'UPDATE enrollment_step_logs SET status=?, executed_at=NOW(), result=? WHERE enrollment_id=? AND step_id=?',
    ['executed', JSON.stringify(result), enrollment.enrollment_id, step.id]
  );
  const next = await one('SELECT id FROM workflow_steps WHERE parent_id=? ORDER BY step_order ASC LIMIT 1', [step.id]);
  await advanceEnrollment(enrollment.enrollment_id, next?.id || null, result, depth);
}

export async function evaluateCondition(step, lead, ad = {}, enrollment = null) {
  if (!ad || !Object.keys(ad).length) {
    try { ad = JSON.parse(step.action_data || '{}'); } catch { ad = {}; }
  }
  const field = ad.condition;
  const op = ad.condition_op || 'eq';
  const expected = ad.condition_val;
  if (field === 'engagement_event') {
    const eventType = String(expected || '').trim().toLowerCase();
    if (!eventType) return false;
    const params = [lead.id, eventType];
    let scope = '';
    if (enrollment?.enrollment_id) {
      scope = ' AND cm.enrollment_id=?';
      params.push(enrollment.enrollment_id);
    }
    const matching = await one(
      `SELECT ce.id FROM communication_events ce
       JOIN communications cm ON cm.id=ce.communication_id
       WHERE ce.lead_id=? AND ce.event_type=?${scope}
       ORDER BY ce.occurred_at DESC LIMIT 1`, params
    );
    return op === 'neq' ? !matching : Boolean(matching);
  }
  if (field === 'reply_keyword') {
    const { keywordMatches, replyTextFromPayload } = await import('./engagement.service.js');
    const params = [lead.id];
    let scope = '';
    if (enrollment?.enrollment_id) {
      scope = ' AND cm.enrollment_id=?';
      params.push(enrollment.enrollment_id);
    }
    const event = await one(
      `SELECT ce.payload FROM communication_events ce JOIN communications cm ON cm.id=ce.communication_id
       WHERE ce.lead_id=? AND ce.event_type='replied'${scope} ORDER BY ce.occurred_at DESC LIMIT 1`, params
    );
    let payload = {};
    try { payload = typeof event?.payload === 'string' ? JSON.parse(event.payload) : (event?.payload || {}); } catch {}
    const matched = keywordMatches(replyTextFromPayload(payload), expected);
    return op === 'neq' ? !matched : matched;
  }
  const value = lead[field];
  if (op === 'eq' || op === 'equals' || op === 'is_true') return String(value ?? '') === String(op === 'is_true' ? '1' : expected ?? '');
  if (op === 'neq') return String(value ?? '') !== String(expected ?? '');
  if (op === 'gt' || op === 'gte') return Number(value || 0) >= Number(expected || 0);
  if (op === 'lt' || op === 'lte') return Number(value || 0) <= Number(expected || 0);
  if (op === 'contains') return String(value || '').toLowerCase().includes(String(expected || '').toLowerCase());
  return false;
}

async function chooseAbWinner(stepId, templateAId, templateBId) {
  if (!templateAId || !templateBId) return null;
  const rows = await q(
    `SELECT cm.template_id, COUNT(*) AS sent,
            SUM(cm.status IN ('opened','clicked','replied')) AS engaged
     FROM communications cm WHERE cm.step_id=? AND cm.template_id IN (?,?)
     GROUP BY cm.template_id`, [stepId, templateAId, templateBId]
  );
  const byId = new Map(rows.map((row) => [Number(row.template_id), { sent: Number(row.sent || 0), engaged: Number(row.engaged || 0) }]));
  const a = byId.get(Number(templateAId));
  const b = byId.get(Number(templateBId));
  // Require a meaningful sample on both sides before stopping the 50/50 split.
  if (!a || !b || a.sent < 20 || b.sent < 20) return null;
  const aRate = a.engaged / a.sent;
  const bRate = b.engaged / b.sent;
  if (Math.abs(aRate - bRate) < 0.001) return null;
  return aRate > bRate ? Number(templateAId) : Number(templateBId);
}

async function sendWithFallback(primary, lead, template, enrollment, step, actionData, defaults) {
  const channels = [primary, ...((Array.isArray(actionData.fallback_channels) ? actionData.fallback_channels : defaults)
    .map((channel) => String(channel).toLowerCase()).filter((channel) => ['email','whatsapp','rcs','sms'].includes(channel) && channel !== primary))];
  const result = { executed_at: new Date().toISOString(), fallback_order: channels };
  for (const channel of channels) {
    const accountId = channel === primary ? actionData.integration_account_id : null;
    const send = await sendCommunication(channel, lead, template, enrollment.enrollment_id, step.id, accountId);
    result[channel] = send;
    if (send.delivered) break;
  }
  return result;
}

async function hasReachedCampaignGoal(campaignId, enrollmentId, lead) {
  const campaign = await one('SELECT goal FROM campaigns WHERE id=? LIMIT 1', [campaignId]);
  const goal = String(campaign?.goal || '').toLowerCase();
  if (!goal) return lead.status === 'won';
  if (goal === 'converted') return lead.status === 'won';
  if (goal === 'replied' || goal === 'clicked') {
    const event = await one(
      `SELECT ce.id FROM communication_events ce JOIN communications cm ON cm.id=ce.communication_id
       WHERE cm.enrollment_id=? AND ce.event_type=? LIMIT 1`, [enrollmentId, goal === 'replied' ? 'replied' : 'clicked']
    );
    return Boolean(event);
  }
  if (goal === 'booked') return Boolean(await one('SELECT id FROM meetings WHERE lead_id=? LIMIT 1', [lead.id]));
  return false;
}

export async function advanceEnrollment(enrollmentId, nextStepId, result, depth = 0) {
  if (!nextStepId) {
    await run("UPDATE lead_enrollments SET status='completed', exit_reason='all_steps_done', completed_at=NOW() WHERE id=?", [enrollmentId]);
    return;
  }
  const nextExecuteAt = await computeNextExecuteAt(nextStepId);
  await run('UPDATE lead_enrollments SET current_step_id=?, next_execute_at=? WHERE id=?', [nextStepId, nextExecuteAt, enrollmentId]);
  await run('INSERT IGNORE INTO enrollment_step_logs (enrollment_id,step_id,status,result) VALUES (?,?,?,?)', [
    enrollmentId, nextStepId, 'pending', JSON.stringify(result || {})
  ]);

  // Auto-chain: if next step fires immediately (delay=0), execute it right now
  const nextStep = await one('SELECT type,delay_value FROM workflow_steps WHERE id=? LIMIT 1', [nextStepId]);
  const immediateTypes = ['email','whatsapp','rcs','sms','send_email','send_whatsapp','send_rcs','send_sms','multi_send','assign_agent','create_task','task','move_pipeline','tag_lead','exit','condition'];
  if (nextStep && Number(nextStep.delay_value || 0) === 0 && immediateTypes.includes(nextStep.type) && depth < MAX_CHAIN) {
    const enrollment = await one('SELECT * FROM lead_enrollments WHERE id=? LIMIT 1', [enrollmentId]);
    if (enrollment && enrollment.status === 'active') {
      await executeWorkflowStep(enrollment, depth + 1);
    }
  }
}

async function assignAgentToLead(leadId, actionDataJson) {
  let data = {};
  try { data = JSON.parse(actionDataJson || '{}'); } catch { data = {}; }
  let agentId = data.agent_id;
  if (!agentId) {
    const agent = await one(
      `SELECT u.id FROM users u LEFT JOIN leads l ON l.assigned_to = u.id
       WHERE u.role IN ('agent','manager') AND u.is_active=1
       GROUP BY u.id ORDER BY COUNT(l.id) ASC LIMIT 1`
    );
    agentId = agent?.id;
  }
  if (agentId) await updateById('leads', leadId, { assigned_to: agentId });
}

async function createWorkflowTask(leadId, actionDataJson) {
  let data = {};
  try { data = JSON.parse(actionDataJson || '{}'); } catch { data = {}; }
  const dueHours = Number(data.due_hours || 24);
  const dueAt = new Date(Date.now() + dueHours * 3600 * 1000);
  await run(
    'INSERT INTO tasks (title,description,lead_id,priority,due_at) VALUES (?,?,?,?,?)',
    [data.title || data.task_title || 'Follow up lead', data.description || null, leadId, data.priority || 'medium', dueAt]
  );
}

async function createWorkflowDeal(leadId, campaignId, actionDataJson) {
  let data = {};
  try { data = typeof actionDataJson === 'string' ? JSON.parse(actionDataJson || '{}') : actionDataJson || {}; } catch { data = {}; }
  const existing = await one('SELECT id FROM deals WHERE lead_id=? LIMIT 1', [leadId]);
  if (existing) return;
  const lead = await one('SELECT * FROM leads WHERE id=? LIMIT 1', [leadId]);
  if (!lead) return;
  let stageId = data.stage_id || data.pipeline_stage;
  if (!stageId) {
    const stage = await one('SELECT id FROM pipeline_stages ORDER BY stage_order ASC LIMIT 1');
    stageId = stage?.id;
  }
  if (!stageId) return;
  await run('INSERT INTO deals (title,lead_id,stage_id,campaign_id,source_id) VALUES (?,?,?,?,?)', [
    `${lead.company || lead.name} - Deal`, leadId, stageId, campaignId, lead.source_id
  ]);
}

async function applyTagToLead(leadId, rawName) {
  const name = String(rawName || '').trim().slice(0, 80);
  if (!name) return;
  let tag = await one('SELECT id FROM tags WHERE name=? LIMIT 1', [name]);
  if (!tag) {
    const colors = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed'];
    const result = await run('INSERT INTO tags (name,color) VALUES (?,?)', [name, colors[leadId % colors.length]]);
    tag = { id: result.insertId };
  }
  await run('INSERT IGNORE INTO lead_tags (lead_id,tag_id) VALUES (?,?)', [leadId, tag.id]);
}
