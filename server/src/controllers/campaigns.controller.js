import { one, q, run, scalar } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { transaction } from '../db/pool.js';

function computeSequenceInsight(steps, openRate) {
  const totalClicks = steps.reduce((sum, r) => sum + Number(r.clicked || 0), 0);
  if (totalClicks > 0) {
    const best = steps.reduce((a, b) => (Number(b.clicked || 0) > Number(a.clicked || 0) ? b : a));
    const share = Math.round((Number(best.clicked) / totalClicks) * 100);
    if (share >= 40) return { type: 'positive', text: `Step ${best.step_order} ("${String(best.type).replaceAll('_', ' ')}") drives ${share}% of all clicks` };
  }
  if (openRate != null && openRate > 0 && openRate < 20) {
    return { type: 'warning', text: `Open rate (${openRate}%) is below target — consider revising subject lines or send times` };
  }
  return null;
}

export async function index(req, res) {
  const campaigns = await q(
    `SELECT c.*, COUNT(le.id) AS enrolled, SUM(le.status='active') AS active_leads,
            SUM(le.status='converted') AS converted, u.name AS created_by_name,
            (SELECT COUNT(*) FROM workflow_steps WHERE campaign_id=c.id) AS step_count,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.channel='whatsapp') AS wa_sent,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.channel='whatsapp' AND cm.status IN ('delivered','opened','clicked','replied')) AS wa_delivered,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.channel='sms') AS sms_sent,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.channel='sms' AND cm.status IN ('delivered','opened','clicked')) AS sms_delivered,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.channel='rcs') AS rcs_sent,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.channel='rcs' AND cm.status IN ('delivered','opened','clicked','replied')) AS rcs_delivered,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.channel='email') AS email_sent,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.channel='email' AND cm.status IN ('opened','clicked')) AS email_opened,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id) AS total_sent,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.status IN ('opened','clicked','replied')) AS total_opened,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.status='clicked') AS total_clicked
     FROM campaigns c LEFT JOIN lead_enrollments le ON le.campaign_id=c.id LEFT JOIN users u ON u.id=c.created_by
     WHERE c.company_id=? AND c.type='drip' GROUP BY c.id ORDER BY c.created_at DESC`,
    [req.companyId]
  );

  for (const c of campaigns) {
    c.channels = ['whatsapp', 'sms', 'rcs', 'email'].filter((ch) => Number(c[`${ch}_sent`] || 0) > 0);
    const sent = Number(c.total_sent || 0), opened = Number(c.total_opened || 0), clicked = Number(c.total_clicked || 0);
    c.open_rate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
    c.click_rate = sent > 0 ? Math.round((clicked / sent) * 100) : 0;
    c.insight = null;
    if (Number(c.step_count) > 0 && sent >= 5) {
      const steps = await q(
        `SELECT ws.id, ws.step_order, ws.type, COUNT(cm.id) AS sent,
                SUM(cm.status IN ('opened','clicked','replied')) AS opened, SUM(cm.status='clicked') AS clicked
         FROM workflow_steps ws LEFT JOIN communications cm ON cm.step_id=ws.id
         WHERE ws.campaign_id=? GROUP BY ws.id ORDER BY ws.step_order ASC`,
        [c.id]
      );
      c.insight = computeSequenceInsight(steps, c.open_rate);
    }
  }

  ok(res, { campaigns });
}

export async function destroy(req, res) {
  const campaign = await one("SELECT id FROM campaigns WHERE id=? AND company_id=? AND type='drip' LIMIT 1", [Number(req.params.id), req.companyId]);
  if (!campaign) return fail(res, 'Sequence not found.', 404);
  await run('DELETE FROM campaigns WHERE id=?', [campaign.id]);
  ok(res, null, 'Sequence deleted.');
}

export async function store(req, res) {
  const name = String(req.body.name || '').trim();
  if (!name) return fail(res, 'Campaign name required.', 422);
  const rawIds = Array.isArray(req.body.entry_source_ids)
    ? req.body.entry_source_ids.map(Number).filter(Boolean)
    : req.body.entry_source_id ? [Number(req.body.entry_source_id)] : [];
  const entryRules = {
    ...(rawIds.length ? { source_ids: rawIds } : {}),
    reentry: req.body.reentry || 'always',
    reentry_after_days: Math.max(0, Number(req.body.reentry_after_days || 0)),
    quiet_hours: req.body.quiet_hours?.enabled ? {
      enabled: true,
      start: req.body.quiet_hours.start || '21:00',
      end: req.body.quiet_hours.end || '09:00'
    } : { enabled: false }
  };
  const result = await run(
    'INSERT INTO campaigns (company_id,name,description,type,status,goal,entry_rules,created_by) VALUES (?,?,?,?,?,?,?,?)',
    [req.companyId, name, req.body.description || '', req.body.type || 'drip', 'draft', req.body.goal || '', JSON.stringify(entryRules), req.user.id]
  );
  ok(res, { id: result.insertId }, 'Campaign created.');
}

export async function show(req, res) {
  const campaign = await one('SELECT * FROM campaigns WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  if (!campaign) return fail(res, 'Campaign not found.', 404);
  const [stats, channels, workflowSteps, stepAnalytics] = await Promise.all([
    one(
      `SELECT COUNT(*) AS total, SUM(status='active') AS active, SUM(status='completed') AS completed,
              SUM(status='converted') AS converted, SUM(status='exited') AS exited
       FROM lead_enrollments WHERE campaign_id=?`,
      [campaign.id]
    ),
    q(
      `SELECT cm.channel, COUNT(*) AS sent, SUM(cm.status IN ('delivered','opened','clicked')) AS delivered,
              SUM(cm.status IN ('opened','clicked')) AS opened, SUM(cm.status='clicked') AS clicked, SUM(cm.status='replied') AS replied
       FROM communications cm JOIN lead_enrollments le ON le.id=cm.enrollment_id WHERE le.campaign_id=? GROUP BY cm.channel`,
      [campaign.id]
    ),
    q('SELECT * FROM workflow_steps WHERE campaign_id=? ORDER BY step_order ASC', [campaign.id]),
    q(
      `SELECT ws.id AS step_id, ws.step_order, ws.type,
              COUNT(DISTINCT cm.id) AS sent,
              COUNT(DISTINCT CASE WHEN ce.event_type='delivered' THEN ce.id END) AS delivered,
              COUNT(DISTINCT CASE WHEN ce.event_type IN ('read','opened') THEN ce.id END) AS read_or_opened,
              COUNT(DISTINCT CASE WHEN ce.event_type='clicked' THEN ce.id END) AS clicked,
              COUNT(DISTINCT CASE WHEN ce.event_type='replied' THEN ce.id END) AS replied,
              COUNT(DISTINCT CASE WHEN ce.event_type IN ('failed','bounced') THEN ce.id END) AS failed
       FROM workflow_steps ws
       LEFT JOIN communications cm ON cm.step_id=ws.id
       LEFT JOIN communication_events ce ON ce.communication_id=cm.id
       WHERE ws.campaign_id=? GROUP BY ws.id ORDER BY ws.step_order ASC`,
      [campaign.id]
    )
  ]);
  ok(res, { campaign, stats, channels, workflowSteps, stepAnalytics });
}

export async function update(req, res) {
  const campaign = await one('SELECT entry_rules FROM campaigns WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  if (!campaign) return fail(res, 'Campaign not found.', 404);
  let entryRules = {};
  try { entryRules = JSON.parse(campaign.entry_rules || '{}'); } catch {}
  if (req.body.reentry !== undefined) entryRules.reentry = req.body.reentry;
  if (req.body.reentry_after_days !== undefined) entryRules.reentry_after_days = Math.max(0, Number(req.body.reentry_after_days || 0));
  if (req.body.quiet_hours !== undefined) entryRules.quiet_hours = req.body.quiet_hours;
  await run('UPDATE campaigns SET name=?, description=?, goal=?, entry_rules=? WHERE id=? AND company_id=?', [
    req.body.name, req.body.description || '', req.body.goal || '', JSON.stringify(entryRules), Number(req.params.id), req.companyId
  ]);
  ok(res, null, 'Campaign updated.');
}

export async function activate(req, res) {
  await run("UPDATE campaigns SET status='active' WHERE id=? AND company_id=?", [Number(req.params.id), req.companyId]);
  ok(res, null, 'Campaign activated.');
}

export async function pause(req, res) {
  await run("UPDATE campaigns SET status='paused' WHERE id=? AND company_id=?", [Number(req.params.id), req.companyId]);
  ok(res, null, 'Campaign paused.');
}

export async function builder(req, res) {
  const campaign = await one('SELECT * FROM campaigns WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  if (!campaign) return fail(res, 'Campaign not found.', 404);
  const [templates, agents, stages, workflowSteps, integrationAccounts] = await Promise.all([
    q("SELECT id,name,channel,subject,body,wa_template_id,integration_account_id FROM templates WHERE status!='archived' AND company_id=? ORDER BY channel,name", [req.companyId]),
    q("SELECT u.id,u.name FROM users u JOIN company_users cu ON cu.user_id=u.id WHERE cu.company_id=? AND u.role IN ('agent','manager') AND u.is_active=1 ORDER BY u.name", [req.companyId]),
    q('SELECT id,name FROM pipeline_stages WHERE is_active=1 ORDER BY stage_order'),
    q('SELECT * FROM workflow_steps WHERE campaign_id=? ORDER BY step_order ASC', [campaign.id]),
    q('SELECT id,name,provider,channel,external_account_id FROM integration_accounts WHERE company_id=? AND is_active=1 ORDER BY provider,name', [req.companyId])
  ]);
  ok(res, { campaign, templates, agents, stages, workflowSteps, integrationAccounts });
}

export async function saveSteps(req, res) {
  const campaignId = Number(req.params.id);
  const campaign = await one('SELECT id FROM campaigns WHERE id=? AND company_id=? LIMIT 1', [campaignId, req.companyId]);
  if (!campaign) return fail(res, 'Campaign not found.', 404);
  const steps = Array.isArray(req.body.steps) ? req.body.steps : [];
  const connections = Array.isArray(req.body.connections) ? req.body.connections : [];
  const activate = req.body.activate === true || req.body.activate === 'true';
  if (!steps.length) return ok(res, null, 'No steps to save.');

  const VALID_TYPES = ['email','whatsapp','rcs','sms','send_email','send_whatsapp','send_rcs','send_sms','multi_send','wait','condition','assign_agent','task','create_task','move_pipeline','update_score','tag_lead','exit'];
  const badStep = steps.find(s => !s.type || !VALID_TYPES.includes(s.type));
  if (badStep) return fail(res, `Invalid step type: "${badStep.type || '(empty)'}". Check your workflow nodes.`, 422);

  await transaction(async (conn) => {
    await run('DELETE FROM workflow_steps WHERE campaign_id=?', [campaignId], conn);
    const idMap = {};
    for (const step of steps) {
      // merge action_data from step (multi_send passes it directly) plus standard fields
      const extraAd = (step.action_data && typeof step.action_data === 'object') ? step.action_data : {};
      const actionData = {
        label: step.label || '',
        agent_id: step.agent_id ? Number(step.agent_id) : null,
        condition: step.condition || '',
        condition_op: step.condition_op === 'equals' ? 'eq' : step.condition_op === 'gt' ? 'gte' : step.condition_op === 'lt' ? 'lte' : step.condition_op || '',
        condition_val: step.condition_op === 'is_true' ? '1' : step.condition_val || '',
        stage_id: step.pipeline_stage || null, pipeline_stage: step.pipeline_stage || null,
        title: step.task_title || '', task_title: step.task_title || '',
        tag_name: String(step.tag_name || '').trim(),
        integration_account_id: step.integration_account_id ? Number(step.integration_account_id) : null,
        x: Number(step.x || 0), y: Number(step.y || 0),
        ...extraAd,
      };
      const result = await run(
        `INSERT INTO workflow_steps (campaign_id,step_order,type,template_id,delay_value,delay_unit,action_data) VALUES (?,?,?,?,?,?,?)`,
        [campaignId, Number(step.step_order || 0), step.type,
         step.template_id ? Number(step.template_id) : null,
         Number(step.delay_value || 0), step.delay_unit || 'days',
         JSON.stringify(actionData)],
        conn
      );
      idMap[step.id] = Number(result.insertId);
    }
    for (const connRow of connections) {
      const fromDb = idMap[connRow.from];
      const toDb   = idMap[connRow.to];
      if (!fromDb || !toDb) continue;
      await run('UPDATE workflow_steps SET parent_id=? WHERE id=?', [fromDb, toDb], conn);
      if (connRow.label === 'yes') await run('UPDATE workflow_steps SET yes_next_id=? WHERE id=?', [toDb, fromDb], conn);
      else if (connRow.label === 'no') await run('UPDATE workflow_steps SET no_next_id=? WHERE id=?', [toDb, fromDb], conn);
    }
    const newStatus = activate ? 'active' : undefined;
    if (newStatus) await run("UPDATE campaigns SET status='active', updated_at=NOW() WHERE id=?", [campaignId], conn);
    else await run('UPDATE campaigns SET updated_at=NOW() WHERE id=?', [campaignId], conn);
  });
  ok(res, { step_count: steps.length }, `Workflow saved (${steps.length} steps).`);
}
