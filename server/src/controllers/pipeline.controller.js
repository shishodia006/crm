import { one, q, run, scalar, updateById, transaction } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { addScoreEvent } from '../services/score.service.js';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { config } from '../config/index.js';

export async function pipelineBoard(_req, res) {
  const stagesRaw = await q(
    `SELECT ps.*, COUNT(d.id) AS count, COALESCE(SUM(d.value),0) AS value
     FROM pipeline_stages ps LEFT JOIN deals d ON d.stage_id=ps.id
     WHERE ps.is_active=1 GROUP BY ps.id ORDER BY ps.stage_order ASC`
  );
  const stages = [];
  for (const stage of stagesRaw) {
    stage.deals = await q(
      `SELECT d.*, l.name AS lead_name, u.name AS assigned_name FROM deals d
       LEFT JOIN leads l ON l.id=d.lead_id LEFT JOIN users u ON u.id=d.assigned_to
       WHERE d.stage_id=? ORDER BY d.value DESC LIMIT 50`,
      [stage.id]
    );
    stages.push(stage);
  }
  ok(res, { stages });
}

export async function dealsIndex(req, res) {
  const page = Math.max(1, Number(req.query.page || 1));
  const perPage = 25;
  const offset = (page - 1) * perPage;
  const total = Number(await scalar('SELECT COUNT(*) FROM deals'));
  const deals = await q(
    `SELECT d.*, l.name AS lead_name, ps.name AS stage_name, u.name AS agent_name
     FROM deals d LEFT JOIN leads l ON l.id=d.lead_id LEFT JOIN pipeline_stages ps ON ps.id=d.stage_id LEFT JOIN users u ON u.id=d.assigned_to
     ORDER BY d.created_at DESC LIMIT ${perPage} OFFSET ${offset}`
  );
  ok(res, { deals, total, page, lastPage: Math.ceil(total / perPage) || 1 });
}

export async function dealsStore(req, res) {
  const data = {
    title: String(req.body.title || '').trim(), lead_id: Number(req.body.lead_id),
    stage_id: Number(req.body.stage_id), assigned_to: req.body.assigned_to ? Number(req.body.assigned_to) : null,
    value: Number(req.body.value || 0), probability: Number(req.body.probability || 0),
    expected_close: req.body.expected_close || null
  };
  if (!data.title || !data.lead_id || !data.stage_id) return fail(res, 'Title, lead, and stage are required.', 422);
  const lead = await one('SELECT source_id FROM leads WHERE id=? LIMIT 1', [data.lead_id]);
  const result = await run(
    'INSERT INTO deals (title,lead_id,stage_id,assigned_to,value,probability,expected_close,source_id) VALUES (?,?,?,?,?,?,?,?)',
    [...Object.values(data), lead?.source_id || null]
  );
  ok(res, { id: result.insertId }, 'Deal created.');
}

export async function dealsShow(req, res) {
  const deal = await one(
    `SELECT d.*, l.name AS lead_name, l.email, l.mobile, l.company, l.source_id, ps.name AS stage_name, u.name AS agent_name
     FROM deals d LEFT JOIN leads l ON l.id=d.lead_id LEFT JOIN pipeline_stages ps ON ps.id=d.stage_id LEFT JOIN users u ON u.id=d.assigned_to
     WHERE d.id=? LIMIT 1`,
    [Number(req.params.id)]
  );
  if (!deal) return fail(res, 'Deal not found.', 404);
  const [activities, tasks, stages, agents] = await Promise.all([
    q('SELECT a.*, u.name AS user_name FROM activities a LEFT JOIN users u ON u.id=a.user_id WHERE a.deal_id=? ORDER BY a.created_at DESC', [deal.id]),
    q('SELECT t.*, u.name AS assigned_name FROM tasks t LEFT JOIN users u ON u.id=t.assigned_to WHERE t.deal_id=? AND t.done=0 ORDER BY t.due_at ASC', [deal.id]),
    q('SELECT * FROM pipeline_stages WHERE is_active=1 ORDER BY stage_order'),
    q("SELECT id,name FROM users WHERE role IN ('agent','manager') AND is_active=1 ORDER BY name")
  ]);
  ok(res, { deal, activities, tasks, stages, agents });
}

export async function dealsUpdate(req, res) {
  const data = {};
  for (const field of ['title','value','probability','expected_close','assigned_to','notes']) {
    if (req.body[field] !== undefined) data[field] = req.body[field] || null;
  }
  if (!Object.keys(data).length) return fail(res, 'Nothing to update.', 422);
  await updateById('deals', Number(req.params.id), data);
  ok(res, null, 'Deal updated.');
}

export async function moveStage(req, res) {
  const dealId = Number(req.params.id);
  const stageId = Number(req.body.stage_id);
  const deal = await one('SELECT id,stage_id FROM deals WHERE id=? LIMIT 1', [dealId]);
  if (!deal) return fail(res, 'Deal not found.', 404);
  if (Number(deal.stage_id) === stageId) return ok(res, { stage_name: null }, 'Deal is already in this stage.');
  const stage = await one('SELECT name FROM pipeline_stages WHERE id=? AND is_active=1 LIMIT 1', [stageId]);
  if (!stage) return fail(res, 'Pipeline stage not found.', 404);
  await run('INSERT INTO deal_stage_history (deal_id,from_stage,to_stage,changed_by) VALUES (?,?,?,?)', [dealId, deal.stage_id, stageId, req.user.id]);
  await run('UPDATE deals SET stage_id=? WHERE id=?', [stageId, dealId]);
  ok(res, { stage_name: stage.name }, `Moved to ${stage.name}`);
}

export async function addNote(req, res) {
  await run("INSERT INTO activities (type,deal_id,user_id,subject,body) VALUES ('note',?,?,?,?)", [
    Number(req.params.id), req.user.id, req.body.subject || 'Note', req.body.body || ''
  ]);
  ok(res, null, 'Note added.');
}

export async function addTask(req, res) {
  await run('INSERT INTO tasks (title,deal_id,assigned_to,priority,due_at,created_by) VALUES (?,?,?,?,?,?)', [
    req.body.title, Number(req.params.id),
    req.body.assigned_to ? Number(req.body.assigned_to) : req.user.id,
    req.body.priority || 'medium', req.body.due_at || null, req.user.id
  ]);
  ok(res, null, 'Task created.');
}

export async function addMeeting(req, res) {
  const deal = await one('SELECT lead_id FROM deals WHERE id=? LIMIT 1', [Number(req.params.id)]);
  await run(
    'INSERT INTO meetings (title,lead_id,deal_id,host_id,platform,meeting_url,scheduled_at,duration) VALUES (?,?,?,?,?,?,?,?)',
    [req.body.title, deal?.lead_id || null, Number(req.params.id), req.user.id,
     req.body.platform || '', req.body.meeting_url || '', req.body.scheduled_at, Number(req.body.duration || 30)]
  );
  if (deal) await addScoreEvent(Number(deal.lead_id), 'meeting_booked', 'deal', Number(req.params.id));
  ok(res, null, 'Meeting scheduled.');
}

export async function uploadFile(req, res) {
  if (!req.file) return fail(res, 'No file uploaded.', 422);
  const ext = path.extname(req.file.originalname).slice(1).toLowerCase();
  const allowed = ['pdf','doc','docx','xls','xlsx','png','jpg','jpeg','csv'];
  if (!allowed.includes(ext)) return fail(res, 'File type not allowed.', 422);
  const filename = `deal_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const finalPath = path.join(config.uploadPath, 'deals', filename);
  await fs.promises.rename(req.file.path, finalPath);
  await run("INSERT INTO activities (type,deal_id,user_id,subject,file_path) VALUES ('document',?,?,?,?)", [
    Number(req.params.id), req.user.id, req.file.originalname, `public/uploads/deals/${filename}`
  ]);
  ok(res, { file: filename }, 'File uploaded.');
}

export async function markWon(req, res) {
  const dealId = Number(req.params.id);
  await transaction(async (conn) => {
    const deal = await one('SELECT * FROM deals WHERE id=? LIMIT 1', [dealId], conn);
    if (!deal) throw new Error('Deal not found.');
    const wonStage = await one('SELECT id FROM pipeline_stages WHERE is_won=1 LIMIT 1', [], conn);
    if (!wonStage) throw new Error('Won pipeline stage is not configured.');
    await run('UPDATE deals SET stage_id=?, won_at=COALESCE(won_at,NOW()), actual_close=COALESCE(actual_close,CURDATE()), lost_at=NULL, lost_reason=NULL WHERE id=?', [wonStage.id, dealId], conn);
    await run("UPDATE leads SET status='won', won_at=COALESCE(won_at,NOW()), lost_at=NULL, lost_reason=NULL WHERE id=?", [deal.lead_id], conn);
    const revenueExists = await one('SELECT id FROM revenue_records WHERE deal_id=? LIMIT 1', [dealId], conn);
    if (Number(deal.value || 0) > 0 && !revenueExists) {
      await run('INSERT INTO revenue_records (deal_id,lead_id,source_id,campaign_id,agent_id,amount) VALUES (?,?,?,?,?,?)', [
        deal.id, deal.lead_id, deal.source_id, deal.campaign_id, deal.assigned_to, deal.value
      ], conn);
      await addScoreEvent(Number(deal.lead_id), 'purchase_completed', 'deal', dealId, conn);
    }
  });
  ok(res, null, 'Deal marked as Won!');
}

export async function markLost(req, res) {
  const dealId = Number(req.params.id);
  const lostStage = await one('SELECT id FROM pipeline_stages WHERE is_lost=1 LIMIT 1');
  if (!lostStage) return fail(res, 'Lost pipeline stage is not configured.', 422);
  await run('UPDATE deals SET lost_at=NOW(), lost_reason=?, stage_id=?, won_at=NULL, actual_close=CURDATE() WHERE id=?', [req.body.reason || '', lostStage.id, dealId]);
  await run("UPDATE leads l JOIN deals d ON d.lead_id=l.id SET l.status='lost', l.lost_at=NOW(), l.lost_reason=?, l.won_at=NULL WHERE d.id=?", [req.body.reason || '', dealId]);
  ok(res, null, 'Deal marked as Lost.');
}
