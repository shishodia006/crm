import { one, q, run } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { backfillSegment } from '../services/segment.service.js';

export async function index(req, res) {
  const segments = await q(
    `SELECT s.*, u.name AS created_by_name,
            (SELECT COUNT(*) FROM segment_leads sl JOIN leads l ON l.id=sl.lead_id WHERE sl.segment_id=s.id AND l.company_id=s.company_id) AS member_count
     FROM segments s LEFT JOIN users u ON u.id=s.created_by
     WHERE s.company_id=? ORDER BY s.created_at DESC`,
    [req.companyId]
  );
  ok(res, { segments });
}

export async function store(req, res) {
  const name = String(req.body.name || '').trim();
  const type = req.body.type === 'static' ? 'static' : 'dynamic';
  if (!name) return fail(res, 'List name is required.', 422);

  const conditions = type === 'dynamic' ? (req.body.conditions || {}) : null;
  const result = await run(
    'INSERT INTO segments (name,description,type,conditions,created_by,company_id) VALUES (?,?,?,?,?,?)',
    [name, req.body.description || null, type, conditions ? JSON.stringify(conditions) : null, req.user.id, req.companyId]
  );
  const segmentId = result.insertId;

  let added = 0;
  if (type === 'static') {
    const leadIds = Array.isArray(req.body.lead_ids) ? req.body.lead_ids.map(Number).filter(Boolean) : [];
    for (const leadId of leadIds) {
      const lead = await one('SELECT id FROM leads WHERE id=? AND company_id=? LIMIT 1', [leadId, req.companyId]);
      if (!lead) continue;
      const r = await run('INSERT IGNORE INTO segment_leads (segment_id,lead_id) VALUES (?,?)', [segmentId, leadId]);
      if (r.affectedRows > 0) added += 1;
    }
  } else {
    added = await backfillSegment(segmentId, req.companyId, conditions);
  }

  ok(res, { id: segmentId, added }, 'List created.');
}

export async function members(req, res) {
  const segment = await one('SELECT * FROM segments WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  if (!segment) return fail(res, 'List not found.', 404);
  const leads = await q(
    `SELECT l.id, l.name, l.email, l.mobile, l.company, l.status
     FROM segment_leads sl JOIN leads l ON l.id=sl.lead_id
     WHERE sl.segment_id=? AND l.company_id=? ORDER BY l.name`,
    [segment.id, req.companyId]
  );
  ok(res, { segment, leads });
}

export async function addMembers(req, res) {
  const segment = await one('SELECT * FROM segments WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  if (!segment) return fail(res, 'List not found.', 404);
  if (segment.type !== 'static') return fail(res, 'Only static lists can have members added manually.', 422);
  const leadIds = Array.isArray(req.body.lead_ids) ? req.body.lead_ids.map(Number).filter(Boolean) : [];
  let added = 0;
  for (const leadId of leadIds) {
    const lead = await one('SELECT id FROM leads WHERE id=? AND company_id=? LIMIT 1', [leadId, req.companyId]);
    if (!lead) continue;
    const r = await run('INSERT IGNORE INTO segment_leads (segment_id,lead_id) VALUES (?,?)', [segment.id, leadId]);
    if (r.affectedRows > 0) added += 1;
  }
  ok(res, { added }, `${added} contact(s) added.`);
}

export async function removeMember(req, res) {
  const segment = await one('SELECT id FROM segments WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  if (!segment) return fail(res, 'List not found.', 404);
  await run('DELETE FROM segment_leads WHERE segment_id=? AND lead_id=?', [segment.id, Number(req.params.leadId)]);
  ok(res, null, 'Removed from list.');
}

export async function destroy(req, res) {
  const segment = await one('SELECT id FROM segments WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  if (!segment) return fail(res, 'List not found.', 404);
  await run('DELETE FROM segments WHERE id=?', [segment.id]);
  ok(res, null, 'List deleted.');
}
