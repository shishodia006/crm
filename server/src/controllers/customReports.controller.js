import crypto from 'crypto';
import { one, q, run, scalar } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { csvEscape } from '../utils/helpers.js';
import { REPORT_CATALOG, CATALOG_BY_KEY, fetchReportData, computeNextSendAt } from '../services/customReport.service.js';

function canView(report, userId) {
  if (Number(report.owner_id) === Number(userId)) return true;
  return report.visibility === 'team' || report.visibility === 'link';
}

export async function counts(req, res) {
  const [mine, shared, scheduled] = await Promise.all([
    scalar('SELECT COUNT(*) FROM custom_reports WHERE company_id=? AND owner_id=?', [req.companyId, req.user.id]),
    scalar("SELECT COUNT(*) FROM custom_reports WHERE company_id=? AND owner_id!=? AND visibility IN ('team','link')", [req.companyId, req.user.id]),
    scalar(
      `SELECT COUNT(*) FROM report_schedules rs JOIN custom_reports cr ON cr.id=rs.report_id
       WHERE cr.company_id=? AND (cr.owner_id=? OR cr.visibility IN ('team','link'))`,
      [req.companyId, req.user.id]
    )
  ]);
  ok(res, { mine: Number(mine), shared: Number(shared), templates: REPORT_CATALOG.length, scheduled: Number(scheduled) });
}

export async function index(req, res) {
  const tab = req.query.tab || 'mine';

  if (tab === 'templates') return ok(res, { reports: REPORT_CATALOG });

  const base = `SELECT cr.*, u.name AS owner_name, u.email AS owner_email
                FROM custom_reports cr JOIN users u ON u.id=cr.owner_id`;

  if (tab === 'shared') {
    const reports = await q(
      `${base} WHERE cr.company_id=? AND cr.owner_id!=? AND cr.visibility IN ('team','link') ORDER BY cr.updated_at DESC`,
      [req.companyId, req.user.id]
    );
    return ok(res, { reports });
  }

  if (tab === 'scheduled') {
    const schedules = await q(
      `SELECT rs.*, cr.name AS report_name, cr.data_source, cr.owner_id
       FROM report_schedules rs JOIN custom_reports cr ON cr.id=rs.report_id
       WHERE cr.company_id=? AND (cr.owner_id=? OR cr.visibility IN ('team','link'))
       ORDER BY rs.next_send_at ASC`,
      [req.companyId, req.user.id]
    );
    return ok(res, { schedules });
  }

  const reports = await q(`${base} WHERE cr.company_id=? AND cr.owner_id=? ORDER BY cr.updated_at DESC`, [req.companyId, req.user.id]);
  ok(res, { reports });
}

export async function store(req, res) {
  const name = String(req.body.name || '').trim();
  const dataSource = req.body.data_source;
  if (!name) return fail(res, 'Report name is required.', 422);
  if (!CATALOG_BY_KEY[dataSource]) return fail(res, 'Unknown data source.', 422);
  const visibility = ['private', 'team', 'link'].includes(req.body.visibility) ? req.body.visibility : 'private';
  const catalogEntry = CATALOG_BY_KEY[dataSource];
  const shareToken = visibility === 'link' ? crypto.randomBytes(24).toString('hex') : null;

  const result = await run(
    `INSERT INTO custom_reports (company_id,owner_id,name,description,data_source,icon,color,visibility,status,share_token)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [req.companyId, req.user.id, name, req.body.description || null, dataSource, catalogEntry.icon, catalogEntry.color, visibility, req.body.status || 'live', shareToken]
  );
  ok(res, { id: result.insertId }, 'Report created.');
}

export async function show(req, res) {
  const report = await one(
    `SELECT cr.*, u.name AS owner_name FROM custom_reports cr JOIN users u ON u.id=cr.owner_id WHERE cr.id=? AND cr.company_id=? LIMIT 1`,
    [Number(req.params.id), req.companyId]
  );
  if (!report) return fail(res, 'Report not found.', 404);
  if (!canView(report, req.user.id)) return fail(res, 'You do not have access to this report.', 403);
  run('UPDATE custom_reports SET last_viewed_at=NOW() WHERE id=?', [report.id]).catch(() => {});
  ok(res, { report });
}

export async function data(req, res) {
  const report = await one('SELECT * FROM custom_reports WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  if (!report) return fail(res, 'Report not found.', 404);
  if (!canView(report, req.user.id)) return fail(res, 'You do not have access to this report.', 403);
  const result = await fetchReportData(report.data_source, req.companyId);
  ok(res, { result });
}

export async function update(req, res) {
  const report = await one('SELECT id,owner_id,visibility,share_token FROM custom_reports WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  if (!report) return fail(res, 'Report not found.', 404);
  if (Number(report.owner_id) !== Number(req.user.id)) return fail(res, 'Only the owner can edit this report.', 403);

  const fields = {};
  if (req.body.name !== undefined) fields.name = String(req.body.name).trim();
  if (req.body.description !== undefined) fields.description = req.body.description || null;
  if (req.body.status !== undefined) fields.status = req.body.status;
  if (req.body.visibility !== undefined && ['private', 'team', 'link'].includes(req.body.visibility)) {
    fields.visibility = req.body.visibility;
    fields.share_token = req.body.visibility === 'link' ? (report.share_token || crypto.randomBytes(24).toString('hex')) : null;
  }
  const keys = Object.keys(fields);
  if (!keys.length) return fail(res, 'Nothing to update.', 422);
  await run(`UPDATE custom_reports SET ${keys.map((k) => `\`${k}\`=?`).join(',')}, updated_at=NOW() WHERE id=?`, [...keys.map((k) => fields[k]), report.id]);
  ok(res, null, 'Report updated.');
}

export async function destroy(req, res) {
  const report = await one('SELECT id,owner_id FROM custom_reports WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  if (!report) return fail(res, 'Report not found.', 404);
  if (Number(report.owner_id) !== Number(req.user.id)) return fail(res, 'Only the owner can delete this report.', 403);
  await run('DELETE FROM custom_reports WHERE id=?', [report.id]);
  ok(res, null, 'Report deleted.');
}

export async function exportCsv(req, res) {
  const tab = req.query.tab || 'mine';
  let rows = [];
  let header = [];
  if (tab === 'templates') {
    header = ['Name', 'Description', 'Data Source'];
    rows = REPORT_CATALOG.map((r) => [r.label, r.description, r.key]);
  } else if (tab === 'scheduled') {
    header = ['Report', 'Frequency', 'Next Send', 'Status'];
    const schedules = await q(
      `SELECT rs.*, cr.name AS report_name FROM report_schedules rs JOIN custom_reports cr ON cr.id=rs.report_id
       WHERE cr.company_id=? AND (cr.owner_id=? OR cr.visibility IN ('team','link'))`,
      [req.companyId, req.user.id]
    );
    rows = schedules.map((s) => [s.report_name, s.frequency, s.next_send_at, s.status]);
  } else {
    header = ['Name', 'Description', 'Data Source', 'Visibility', 'Status', 'Owner', 'Updated'];
    const where = tab === 'shared'
      ? `cr.company_id=? AND cr.owner_id!=? AND cr.visibility IN ('team','link')`
      : `cr.company_id=? AND cr.owner_id=?`;
    const reports = await q(
      `SELECT cr.*, u.name AS owner_name FROM custom_reports cr JOIN users u ON u.id=cr.owner_id WHERE ${where} ORDER BY cr.updated_at DESC`,
      [req.companyId, req.user.id]
    );
    rows = reports.map((r) => [r.name, r.description, r.data_source, r.visibility, r.status, r.owner_name, r.updated_at]);
  }
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="custom_reports_${tab}_${Date.now()}.csv"`);
  res.send(csv);
}

// ─── Schedules ──────────────────────────────────────────────

export async function scheduleStore(req, res) {
  const report = await one('SELECT id,owner_id FROM custom_reports WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  if (!report) return fail(res, 'Report not found.', 404);
  if (Number(report.owner_id) !== Number(req.user.id)) return fail(res, 'Only the owner can schedule this report.', 403);

  const frequency = ['daily', 'weekly', 'monthly'].includes(req.body.frequency) ? req.body.frequency : 'weekly';
  const schedule = {
    frequency,
    send_time: req.body.send_time || '09:00:00',
    day_of_week: frequency === 'weekly' ? Number(req.body.day_of_week ?? 1) : null,
    day_of_month: frequency === 'monthly' ? Number(req.body.day_of_month ?? 1) : null,
  };
  const recipients = req.body.recipients?.type === 'users'
    ? { type: 'users', user_ids: (req.body.recipients.user_ids || []).map(Number) }
    : { type: 'team' };

  const nextSendAt = computeNextSendAt(schedule);
  const result = await run(
    `INSERT INTO report_schedules (report_id,frequency,send_time,day_of_week,day_of_month,recipients,status,next_send_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    [report.id, schedule.frequency, schedule.send_time, schedule.day_of_week, schedule.day_of_month, JSON.stringify(recipients), 'active', nextSendAt]
  );
  ok(res, { id: result.insertId }, 'Schedule created.');
}

export async function scheduleUpdate(req, res) {
  const scheduleId = Number(req.params.sid);
  const existing = await one(
    `SELECT rs.*, cr.owner_id, cr.company_id FROM report_schedules rs JOIN custom_reports cr ON cr.id=rs.report_id WHERE rs.id=? AND rs.report_id=? LIMIT 1`,
    [scheduleId, Number(req.params.id)]
  );
  if (!existing || Number(existing.company_id) !== Number(req.companyId)) return fail(res, 'Schedule not found.', 404);
  if (Number(existing.owner_id) !== Number(req.user.id)) return fail(res, 'Only the owner can modify this schedule.', 403);

  const fields = {};
  if (req.body.status && ['active', 'paused'].includes(req.body.status)) fields.status = req.body.status;
  if (req.body.frequency && ['daily', 'weekly', 'monthly'].includes(req.body.frequency)) fields.frequency = req.body.frequency;
  if (req.body.send_time) fields.send_time = req.body.send_time;
  if (req.body.day_of_week !== undefined) fields.day_of_week = Number(req.body.day_of_week);
  if (req.body.day_of_month !== undefined) fields.day_of_month = Number(req.body.day_of_month);
  if (req.body.recipients) {
    fields.recipients = JSON.stringify(req.body.recipients.type === 'users'
      ? { type: 'users', user_ids: (req.body.recipients.user_ids || []).map(Number) }
      : { type: 'team' });
  }
  const merged = { ...existing, ...fields };
  fields.next_send_at = computeNextSendAt(merged);

  const keys = Object.keys(fields);
  await run(`UPDATE report_schedules SET ${keys.map((k) => `\`${k}\`=?`).join(',')} WHERE id=?`, [...keys.map((k) => fields[k]), scheduleId]);
  ok(res, null, 'Schedule updated.');
}

export async function scheduleDestroy(req, res) {
  const scheduleId = Number(req.params.sid);
  const existing = await one(
    `SELECT rs.id, cr.owner_id, cr.company_id FROM report_schedules rs JOIN custom_reports cr ON cr.id=rs.report_id WHERE rs.id=? AND rs.report_id=? LIMIT 1`,
    [scheduleId, Number(req.params.id)]
  );
  if (!existing || Number(existing.company_id) !== Number(req.companyId)) return fail(res, 'Schedule not found.', 404);
  if (Number(existing.owner_id) !== Number(req.user.id)) return fail(res, 'Only the owner can delete this schedule.', 403);
  await run('DELETE FROM report_schedules WHERE id=?', [scheduleId]);
  ok(res, null, 'Schedule deleted.');
}

// ─── Public (share-link) ────────────────────────────────────

export async function publicShow(req, res) {
  const report = await one("SELECT * FROM custom_reports WHERE share_token=? AND visibility='link' LIMIT 1", [req.params.token]);
  if (!report) return fail(res, 'Report not found or link has been revoked.', 404);
  const result = await fetchReportData(report.data_source, report.company_id);
  ok(res, { report: { name: report.name, description: report.description, data_source: report.data_source }, result });
}
