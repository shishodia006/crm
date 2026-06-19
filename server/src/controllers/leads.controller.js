import fs from 'fs';
import { parse as parseCsv } from 'csv-parse/sync';
import { one, q, run, updateById } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { csvEscape } from '../utils/helpers.js';
import { listLeads, processLead, leadTimeline } from '../services/lead.service.js';
import { enrollLead } from '../services/drip.service.js';
import { addScoreEvent } from '../services/score.service.js';

export async function index(req, res) {
  const page = Math.max(1, Number(req.query.page || 1));
  const filters = {
    search: req.query.search || '', source_id: req.query.source_id || '',
    status: req.query.status || '', category: req.query.category || '',
    assigned: req.query.assigned || '', date_from: req.query.date_from || '', date_to: req.query.date_to || ''
  };
  const [pagination, sources, agents] = await Promise.all([
    listLeads(filters, page),
    q("SELECT id,name FROM lead_sources WHERE is_active=1 ORDER BY CASE WHEN slug='manual' THEN 0 ELSE 1 END, name"),
    q("SELECT id,name FROM users WHERE role IN ('agent','manager') AND is_active=1 ORDER BY name")
  ]);
  ok(res, { leads: pagination.data, pagination, filters, sources, agents });
}

export async function store(req, res) {
  const sourceId = Number(req.body.source_id || 19);
  const result = await processLead(req.body, sourceId, null, req);
  if (!result.success) return fail(res, 'Validation failed', 422, result.errors);
  ok(res, result, result.is_duplicate ? 'Lead already exists.' : 'Lead created.');
}

export async function exportCsv(_req, res) {
  const leads = await q(
    `SELECT l.name,l.email,l.mobile,l.company,l.designation,l.industry,l.city,l.state,l.country,l.score,l.category,l.status,ls.name AS source,l.created_at
     FROM leads l LEFT JOIN lead_sources ls ON ls.id=l.source_id ORDER BY l.created_at DESC`
  );
  const header = ['Name','Email','Mobile','Company','Designation','Industry','City','State','Country','Score','Category','Status','Source','Created At'];
  const rows = [header, ...leads.map((row) => Object.values(row))].map((row) => row.map(csvEscape).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="leads_${Date.now()}.csv"`);
  res.send(rows);
}

export async function show(req, res) {
  const leadId = Number(req.params.id);
  const lead = await one(
    `SELECT l.*, ls.name AS source_name, u.name AS assigned_name
     FROM leads l LEFT JOIN lead_sources ls ON ls.id=l.source_id LEFT JOIN users u ON u.id=l.assigned_to
     WHERE l.id=? LIMIT 1`,
    [leadId]
  );
  if (!lead) return fail(res, 'Lead not found.', 404);
  const [timeline, campaigns, agents, sources, enrollments, scoreHistory] = await Promise.all([
    leadTimeline(leadId),
    q("SELECT id,name FROM campaigns WHERE status='active' ORDER BY name"),
    q("SELECT id,name FROM users WHERE role IN ('agent','manager') AND is_active=1 ORDER BY name"),
    q('SELECT id,name FROM lead_sources WHERE is_active=1 ORDER BY name'),
    q(`SELECT le.*, c.name AS campaign_name FROM lead_enrollments le LEFT JOIN campaigns c ON c.id=le.campaign_id WHERE le.lead_id=? ORDER BY le.enrolled_at DESC`, [leadId]),
    q('SELECT * FROM lead_score_events WHERE lead_id=? ORDER BY created_at DESC LIMIT 10', [leadId])
  ]);
  ok(res, { lead, timeline, campaigns, agents, sources, enrollments, scoreHistory });
}

export async function update(req, res) {
  const allowed = ['name','email','mobile','company','designation','industry','city','state','country','product_interest','status','assigned_to','source_id','notes'];
  const data = {};
  for (const field of allowed) {
    if (req.body[field] !== undefined) data[field] = req.body[field] === '' ? null : req.body[field];
  }
  await updateById('leads', Number(req.params.id), data);
  ok(res, null, 'Lead updated.');
}

export async function destroy(req, res) {
  await run('DELETE FROM leads WHERE id=?', [Number(req.params.id)]);
  ok(res, null, 'Lead deleted.');
}

export async function importCsv(req, res) {
  if (!req.file) return fail(res, 'CSV file required.', 422);
  const sourceId = Number(req.body.source_id || 16);
  const fileText = await fs.promises.readFile(req.file.path, 'utf8');
  await fs.promises.unlink(req.file.path).catch(() => {});
  const rows = parseCsv(fileText, { columns: true, skip_empty_lines: true, trim: true });
  const summary = { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  for (const row of rows) {
    summary.total += 1;
    const result = await processLead(row, sourceId, null, req);
    if (result.success) result.is_duplicate ? summary.duplicates += 1 : summary.imported += 1;
    else {
      summary.failed += 1;
      summary.errors.push(`Row ${summary.total}: ${Object.values(result.errors).join(', ')}`);
    }
  }
  ok(res, summary, `Imported ${summary.imported} leads.`);
}

export async function enroll(req, res) {
  const campaignId = Number(req.body.campaign_id);
  if (!campaignId) return fail(res, 'campaign_id required', 422);
  const enrolled = await enrollLead(Number(req.params.id), campaignId);
  ok(res, { enrolled }, enrolled ? 'Lead enrolled in campaign.' : 'Already enrolled or ineligible.');
}

export async function addScore(req, res) {
  const score = await addScoreEvent(Number(req.params.id), req.body.event || 'manual');
  ok(res, { score }, 'Score updated.');
}

export async function timeline(req, res) {
  ok(res, await leadTimeline(Number(req.params.id)));
}

export async function meta(_req, res) {
  const [sources, agents, stages, templates, campaigns] = await Promise.all([
    q('SELECT id,name,slug,category FROM lead_sources WHERE is_active=1 ORDER BY name'),
    q("SELECT id,name,email,role FROM users WHERE role IN ('agent','manager','admin','superadmin') AND is_active=1 ORDER BY name"),
    q('SELECT * FROM pipeline_stages WHERE is_active=1 ORDER BY stage_order'),
    q("SELECT id,name,channel,subject,body,wa_template_id,status FROM templates WHERE status!='archived' ORDER BY channel,name"),
    q("SELECT id,name,status FROM campaigns WHERE status IN ('active','draft','paused') ORDER BY name")
  ]);
  ok(res, { sources, agents, stages, templates, campaigns });
}
