import { one, q, run } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { transaction } from '../db/pool.js';

export async function index(_req, res) {
  const campaigns = await q(
    `SELECT c.*, COUNT(le.id) AS enrolled, SUM(le.status='active') AS active_leads,
            SUM(le.status='converted') AS converted, u.name AS created_by_name,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.channel='whatsapp') AS wa_sent,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.channel='whatsapp' AND cm.status IN ('delivered','opened','clicked','replied')) AS wa_delivered,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.channel='sms') AS sms_sent,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.channel='sms' AND cm.status IN ('delivered','opened','clicked')) AS sms_delivered,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.channel='rcs') AS rcs_sent,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.channel='rcs' AND cm.status IN ('delivered','opened','clicked','replied')) AS rcs_delivered,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.channel='email') AS email_sent,
            (SELECT COUNT(*) FROM communications cm JOIN lead_enrollments x ON x.id=cm.enrollment_id WHERE x.campaign_id=c.id AND cm.channel='email' AND cm.status IN ('opened','clicked')) AS email_opened
     FROM campaigns c LEFT JOIN lead_enrollments le ON le.campaign_id=c.id LEFT JOIN users u ON u.id=c.created_by
     GROUP BY c.id ORDER BY c.created_at DESC`
  );
  ok(res, { campaigns });
}

export async function store(req, res) {
  const name = String(req.body.name || '').trim();
  if (!name) return fail(res, 'Campaign name required.', 422);
  const rawIds = Array.isArray(req.body.entry_source_ids)
    ? req.body.entry_source_ids.map(Number).filter(Boolean)
    : req.body.entry_source_id ? [Number(req.body.entry_source_id)] : [];
  const entryRules = rawIds.length ? { source_ids: rawIds } : {};
  const result = await run(
    'INSERT INTO campaigns (name,description,type,status,goal,entry_rules,created_by) VALUES (?,?,?,?,?,?,?)',
    [name, req.body.description || '', req.body.type || 'drip', 'draft', req.body.goal || '', JSON.stringify(entryRules), req.user.id]
  );
  ok(res, { id: result.insertId }, 'Campaign created.');
}

export async function show(req, res) {
  const campaign = await one('SELECT * FROM campaigns WHERE id=? LIMIT 1', [Number(req.params.id)]);
  if (!campaign) return fail(res, 'Campaign not found.', 404);
  const [stats, channels, workflowSteps] = await Promise.all([
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
    q('SELECT * FROM workflow_steps WHERE campaign_id=? ORDER BY step_order ASC', [campaign.id])
  ]);
  ok(res, { campaign, stats, channels, workflowSteps });
}

export async function update(req, res) {
  await run('UPDATE campaigns SET name=?, description=?, goal=? WHERE id=?', [
    req.body.name, req.body.description || '', req.body.goal || '', Number(req.params.id)
  ]);
  ok(res, null, 'Campaign updated.');
}

export async function activate(req, res) {
  await run("UPDATE campaigns SET status='active' WHERE id=?", [Number(req.params.id)]);
  ok(res, null, 'Campaign activated.');
}

export async function pause(req, res) {
  await run("UPDATE campaigns SET status='paused' WHERE id=?", [Number(req.params.id)]);
  ok(res, null, 'Campaign paused.');
}

export async function builder(req, res) {
  const campaign = await one('SELECT * FROM campaigns WHERE id=? LIMIT 1', [Number(req.params.id)]);
  if (!campaign) return fail(res, 'Campaign not found.', 404);
  const [templates, agents, stages, workflowSteps] = await Promise.all([
    q("SELECT id,name,channel,subject,body,wa_template_id FROM templates WHERE status!='archived' ORDER BY channel,name"),
    q("SELECT id,name FROM users WHERE role IN ('agent','manager') AND is_active=1 ORDER BY name"),
    q('SELECT id,name FROM pipeline_stages WHERE is_active=1 ORDER BY stage_order'),
    q('SELECT * FROM workflow_steps WHERE campaign_id=? ORDER BY step_order ASC', [campaign.id])
  ]);
  ok(res, { campaign, templates, agents, stages, workflowSteps });
}

export async function saveSteps(req, res) {
  const campaignId = Number(req.params.id);
  const steps = Array.isArray(req.body.steps) ? req.body.steps : [];
  const connections = Array.isArray(req.body.connections) ? req.body.connections : [];
  const activate = req.body.activate === true || req.body.activate === 'true';
  if (!steps.length) return ok(res, null, 'No steps to save.');

  const VALID_TYPES = ['email','whatsapp','rcs','sms','send_email','send_whatsapp','send_rcs','send_sms','multi_send','wait','condition','assign_agent','task','create_task','move_pipeline','update_score','exit'];
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
