import { one, q, run } from '../db/pool.js';
import { updateById } from '../db/pool.js';
import { config } from '../config/index.js';
import { addScoreEvent } from './score.service.js';
import { sendCommunication } from './comm.service.js';

export async function enrollLead(leadId, campaignId, conn = undefined) {
  const { pool } = await import('../db/pool.js');
  const db = conn || pool;
  const existing = await one(
    'SELECT id,status FROM lead_enrollments WHERE lead_id=? AND campaign_id=? LIMIT 1',
    [leadId, campaignId], db
  );
  if (existing && ['active', 'paused'].includes(existing.status)) return false;

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
  const step = await one('SELECT type,delay_value,delay_unit FROM workflow_steps WHERE id=? LIMIT 1', [stepId], db);
  const amount = Number(step?.delay_value || 0);
  if (!step || amount <= 0) return new Date();
  const date = new Date();
  if (step.delay_unit === 'minutes') date.setMinutes(date.getMinutes() + amount);
  else if (step.delay_unit === 'hours')  date.setHours(date.getHours() + amount);
  else                                   date.setDate(date.getDate() + amount);
  return date;
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

  let result = { executed_at: new Date().toISOString() };
  let ad = {};
  try { ad = typeof step.action_data === 'string' ? JSON.parse(step.action_data || '{}') : (step.action_data || {}); } catch {}

  const template = step.template_id ? await one("SELECT * FROM templates WHERE id=? AND status='active' LIMIT 1", [step.template_id]) : null;

  if (['send_email', 'email'].includes(step.type)) {
    result.email = await sendCommunication('email', lead, template, enrollment.enrollment_id, step.id);

  } else if (['send_whatsapp', 'whatsapp'].includes(step.type)) {
    result.whatsapp = await sendCommunication('whatsapp', lead, template, enrollment.enrollment_id, step.id);
    if (!result.whatsapp.delivered) {
      result.rcs = await sendCommunication('rcs', lead, template, enrollment.enrollment_id, step.id);
      if (!result.rcs.delivered) result.sms = await sendCommunication('sms', lead, template, enrollment.enrollment_id, step.id);
    }

  } else if (['send_rcs', 'rcs'].includes(step.type)) {
    result.rcs = await sendCommunication('rcs', lead, template, enrollment.enrollment_id, step.id);
    if (!result.rcs.delivered) result.sms = await sendCommunication('sms', lead, template, enrollment.enrollment_id, step.id);

  } else if (['send_sms', 'sms'].includes(step.type)) {
    result.sms = await sendCommunication('sms', lead, template, enrollment.enrollment_id, step.id);

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
    const nextStepId = evaluateCondition(step, lead, ad) ? step.yes_next_id : step.no_next_id;
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

export function evaluateCondition(step, lead, ad = {}) {
  if (!ad || !Object.keys(ad).length) {
    try { ad = JSON.parse(step.action_data || '{}'); } catch { ad = {}; }
  }
  const field = ad.condition;
  const op = ad.condition_op || 'eq';
  const expected = ad.condition_val;
  const value = lead[field];
  if (op === 'eq' || op === 'equals' || op === 'is_true') return String(value ?? '') === String(op === 'is_true' ? '1' : expected ?? '');
  if (op === 'neq') return String(value ?? '') !== String(expected ?? '');
  if (op === 'gt' || op === 'gte') return Number(value || 0) >= Number(expected || 0);
  if (op === 'lt' || op === 'lte') return Number(value || 0) <= Number(expected || 0);
  if (op === 'contains') return String(value || '').toLowerCase().includes(String(expected || '').toLowerCase());
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
  const immediateTypes = ['email','whatsapp','rcs','sms','send_email','send_whatsapp','send_rcs','send_sms','multi_send','assign_agent','create_task','task','move_pipeline','exit','condition'];
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
  await run(
    'INSERT INTO tasks (title,description,lead_id,priority,due_at) VALUES (?,?,?,?,DATE_ADD(NOW(), INTERVAL ? HOUR))',
    [data.title || data.task_title || 'Follow up lead', data.description || null, leadId, data.priority || 'medium', dueHours]
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
