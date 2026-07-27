import fs from 'fs';
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import { one, q, run, updateById } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { csvEscape } from '../utils/helpers.js';
import { listLeads, processLead, leadTimeline, normalizeImportRow, findLeadByEmailOrMobile } from '../services/lead.service.js';
import { enrollLead } from '../services/drip.service.js';
import { addScoreEvent } from '../services/score.service.js';

export async function index(req, res) {
  const page = Math.max(1, Number(req.query.page || 1));
  const perPage = Math.min(100, Math.max(10, Number(req.query.limit || 25)));
  const filters = {
    search: req.query.search || '', source_id: req.query.source_id || '',
    status: req.query.status || '', category: req.query.category || '',
    assigned: req.query.assigned || '', date_from: req.query.date_from || '', date_to: req.query.date_to || ''
  };
  const [pagination, sources, agents] = await Promise.all([
    listLeads(filters, page, perPage, req.companyId),
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

// Used by the manual "New Lead" form to warn the user before submit — same
// email/mobile lookup processLead uses internally to decide merge-vs-insert.
export async function checkDuplicate(req, res) {
  const email = String(req.query.email || '').trim().toLowerCase();
  let mobile = String(req.query.mobile || '').trim().replace(/[^\d+]/g, '');
  if (/^\d{10}$/.test(mobile)) mobile = `+91${mobile}`;
  if (!email && !mobile) return ok(res, { duplicate: null });
  const existing = await findLeadByEmailOrMobile(email, mobile, req.companyId);
  ok(res, { duplicate: existing ? { id: existing.id, name: existing.name, email: existing.email, mobile: existing.mobile, status: existing.status } : null });
}

export async function exportCsv(req, res) {
  const leads = await q(
    `SELECT l.name,l.email,l.mobile,l.company,l.designation,l.industry,l.city,l.state,l.country,l.score,l.category,l.status,ls.name AS source,l.created_at
     FROM leads l LEFT JOIN lead_sources ls ON ls.id=l.source_id WHERE l.company_id=? ORDER BY l.created_at DESC`,
    [req.companyId]
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
     WHERE l.id=? AND l.company_id=? LIMIT 1`,
    [leadId, req.companyId]
  );
  if (!lead) return fail(res, 'Lead not found.', 404);
  const [timeline, campaigns, agents, sources, enrollments, scoreHistory] = await Promise.all([
    leadTimeline(leadId),
    q("SELECT id,name FROM campaigns WHERE status='active' AND company_id=? ORDER BY name", [req.companyId]),
    q("SELECT id,name FROM users WHERE role IN ('agent','manager') AND is_active=1 ORDER BY name"),
    q('SELECT id,name FROM lead_sources WHERE is_active=1 ORDER BY name'),
    q(`SELECT le.*, c.name AS campaign_name FROM lead_enrollments le LEFT JOIN campaigns c ON c.id=le.campaign_id WHERE le.lead_id=? AND c.company_id=? ORDER BY le.enrolled_at DESC`, [leadId, req.companyId]),
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
  const leadId = Number(req.params.id);
  const exists = await one('SELECT id,name,company,source_id,status FROM leads WHERE id=? AND company_id=? LIMIT 1', [leadId, req.companyId]);
  if (!exists) return fail(res, 'Lead not found.', 404);
  await updateById('leads', leadId, data);

  // First time a lead becomes qualified, auto-create a deal so sales can start
  // tracking it in the pipeline without a separate manual "New Deal" step.
  if (data.status === 'qualified' && exists.status !== 'qualified') {
    const hasOpenDeal = await one(
      'SELECT id FROM deals WHERE lead_id=? AND company_id=? AND won_at IS NULL AND lost_at IS NULL LIMIT 1',
      [leadId, req.companyId]
    );
    if (!hasOpenDeal) {
      const stage = await one('SELECT id FROM pipeline_stages WHERE is_active=1 ORDER BY stage_order ASC LIMIT 1');
      if (stage) {
        const title = `${exists.name}${exists.company ? ' - ' + exists.company : ''}`;
        await run(
          'INSERT INTO deals (company_id,title,lead_id,stage_id,value,source_id) VALUES (?,?,?,?,0,?)',
          [req.companyId, title, leadId, stage.id, exists.source_id || null]
        );
      }
    }
  }

  ok(res, null, 'Lead updated.');
}

export async function destroy(req, res) {
  await run('DELETE FROM leads WHERE id=? AND company_id=?', [Number(req.params.id), req.companyId]);
  ok(res, null, 'Lead deleted.');
}

// ExcelJS row.values is 1-indexed with a leading empty slot (index 0 is always
// undefined), so both header and data rows need slice(1) to line up with plain
// array indices.
async function parseExcelRows(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  // Prefer a sheet literally named "Leads" (what our own sample template uses,
  // alongside an "Instructions" sheet that must never be parsed as lead data);
  // otherwise fall back to the first sheet, for arbitrary user-provided files.
  const sheet = workbook.worksheets.find((ws) => ws.name.trim().toLowerCase() === 'leads') || workbook.worksheets[0];
  if (!sheet) return [];
  const headers = sheet.getRow(1).values.slice(1).map((v) => String(v ?? '').trim());
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values.slice(1);
    const record = {};
    headers.forEach((header, i) => {
      if (header) record[header] = values[i] != null ? String(values[i]).trim() : '';
    });
    if (Object.values(record).some((v) => v !== '')) rows.push(record);
  });
  return rows;
}


const BRAND_PURPLE = 'FF4D50D8';

export async function sampleImport(req, res) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Dot Domino CRM';

  // ── Instructions sheet ──────────────────────────────────────────
  const info = workbook.addWorksheet('Instructions');
  info.columns = [
    { key: 'field', width: 20 },
    { key: 'required', width: 12 },
    { key: 'headers', width: 55 },
    { key: 'notes', width: 45 },
  ];

  info.mergeCells('A1:D1');
  const title = info.getCell('A1');
  title.value = 'Dot Domino CRM — Lead Import Template';
  title.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  title.alignment = { vertical: 'middle' };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PURPLE } };
  info.getRow(1).height = 28;

  info.mergeCells('A2:D2');
  info.getCell('A2').value = 'Fill in the "Leads" sheet using any of the column names below (not case-sensitive). Delete the two example rows before importing.';
  info.getCell('A2').font = { italic: true, color: { argb: 'FF6B7280' } };
  info.getRow(2).height = 18;

  const headerRow = info.addRow(['Field', 'Required?', 'Accepted Column Names', 'Notes']);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PURPLE } }; });

  const rows = [
    ['Name', 'Yes', 'Name, Full Name, Contact Name, Lead Name', 'The only field that must be present.'],
    ['Email', 'One of Email/Mobile', 'Email, Email Address, Email Id, E-mail — or any header containing "email"', ''],
    ['Mobile', 'One of Email/Mobile', 'Mobile, Phone, Phone Number, Mobile Number, Contact Number, WhatsApp Number — or any header containing "mobile"', 'Include country code if outside India, e.g. +60...'],
    ['Company', 'No', 'Company, Company Name, Organization, Organisation', ''],
    ['Designation', 'No', 'Designation, Job Title, Title, Role', ''],
    ['Industry', 'No', 'Industry', ''],
    ['City', 'No', 'City', ''],
    ['State', 'No', 'State', ''],
    ['Country', 'No', 'Country', 'Defaults to India if left blank.'],
    ['Pincode', 'No', 'Pincode, Pin Code, Zip, Zip Code, Postal Code', ''],
    ['Website', 'No', 'Website, Website URL', ''],
    ['Product Interest', 'No', 'Product_Interest, Product, Product Interest, Subject, Requirement', ''],
  ];
  for (const r of rows) {
    const row = info.addRow(r);
    row.alignment = { vertical: 'top', wrapText: true };
  }
  info.getColumn(2).alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
  info.views = [{ state: 'frozen', ySplit: 3 }];

  // ── Leads sheet (the actual fillable template) ──────────────────
  const sheet = workbook.addWorksheet('Leads');
  sheet.columns = [
    { header: 'Name', key: 'name', width: 22 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Mobile', key: 'mobile', width: 16 },
    { header: 'Company', key: 'company', width: 24 },
    { header: 'City', key: 'city', width: 16 },
  ];
  const leadHeaderRow = sheet.getRow(1);
  leadHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  leadHeaderRow.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_PURPLE } }; });
  sheet.addRow({ name: 'Rohan Sharma', email: 'rohan.sharma@example.com', mobile: '9876543210', company: 'Acme Traders', city: 'Mumbai' });
  sheet.addRow({ name: 'Priya Nair', email: 'priya.nair@example.com', mobile: '9123456780', company: 'Nair Textiles', city: 'Kochi' });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="leads-import-sample.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
}

export async function importCsv(req, res) {
  if (!req.file) return fail(res, 'File required.', 422);
  const filename = req.file.originalname || '';
  const isCsv = /\.csv$/i.test(filename);
  const isExcel = /\.xlsx?$/i.test(filename);
  if (!isCsv && !isExcel) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    return fail(res, 'Please upload a .csv or .xlsx file.', 422);
  }
  const sourceId = Number(req.body.source_id || 16);
  let rows;
  try {
    rows = isCsv
      ? parseCsv(await fs.promises.readFile(req.file.path, 'utf8'), { columns: true, skip_empty_lines: true, trim: true })
      : await parseExcelRows(req.file.path);
  } finally {
    await fs.promises.unlink(req.file.path).catch(() => {});
  }
  const summary = { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  for (const row of rows) {
    summary.total += 1;
    // skipWelcomeTask: a bulk import can be thousands of rows — one "Welcome new
    // lead" task per row would flood Tasks. One summary task after the loop
    // instead (below).
    const result = await processLead(normalizeImportRow(row), sourceId, null, req, undefined, { skipWelcomeTask: true });
    if (result.success) result.is_duplicate ? summary.duplicates += 1 : summary.imported += 1;
    else {
      summary.failed += 1;
      summary.errors.push(`Row ${summary.total}: ${Object.values(result.errors).join(', ')}`);
    }
  }
  if (summary.imported > 0) {
    try {
      await run(
        `INSERT INTO tasks (company_id, title, description, priority, due_at)
         VALUES (?, ?, ?, 'high', NOW())`,
        [req.companyId, `Review ${summary.imported} imported leads`, `Bulk import added ${summary.imported} new lead(s) from ${filename} — review and reach out.`]
      );
    } catch (err) {
      // The import itself already succeeded (leads are committed) — this task is
      // a convenience notification, not something that should fail the whole
      // response if it errors for some reason. Log it so it's not silently lost.
      console.error('[importCsv] summary task creation failed:', err);
    }
  }
  ok(res, summary, `Imported ${summary.imported} leads.`);
}

export async function enroll(req, res) {
  const campaignId = Number(req.body.campaign_id);
  if (!campaignId) return fail(res, 'campaign_id required', 422);
  const lead = await one('SELECT id FROM leads WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  const campaign = await one('SELECT id FROM campaigns WHERE id=? AND company_id=? LIMIT 1', [campaignId, req.companyId]);
  if (!lead || !campaign) return fail(res, 'Lead or campaign not found.', 404);
  const enrolled = await enrollLead(Number(req.params.id), campaignId);
  ok(res, { enrolled }, enrolled ? 'Lead enrolled in campaign.' : 'Already enrolled or ineligible.');
}

export async function addScore(req, res) {
  const score = await addScoreEvent(Number(req.params.id), req.body.event || 'manual');
  ok(res, { score }, 'Score updated.');
}

export async function timeline(req, res) {
  const lead = await one('SELECT id FROM leads WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  if (!lead) return fail(res, 'Lead not found.', 404);
  ok(res, await leadTimeline(Number(req.params.id)));
}

export async function enrollmentDetail(req, res) {
  const leadId  = Number(req.params.id);
  const enrollId = Number(req.params.eid);
  const enrollment = await one(
    `SELECT le.*, c.name AS campaign_name, c.type AS campaign_type
     FROM lead_enrollments le JOIN campaigns c ON c.id=le.campaign_id
     WHERE le.id=? AND le.lead_id=? AND c.company_id=? LIMIT 1`,
    [enrollId, leadId, req.companyId]
  );
  if (!enrollment) return fail(res, 'Enrollment not found.', 404);
  const [steps, comms] = await Promise.all([
    q(
      `SELECT ws.id, ws.step_order, ws.type, ws.delay_value, ws.delay_unit, ws.action_data,
              esl.status AS log_status, esl.executed_at, esl.result
       FROM workflow_steps ws
       LEFT JOIN enrollment_step_logs esl ON esl.step_id=ws.id AND esl.enrollment_id=?
       WHERE ws.campaign_id=?
       ORDER BY ws.step_order ASC`,
      [enrollId, enrollment.campaign_id]
    ),
    q(
      `SELECT channel, status, subject, created_at, sent_at, delivered_at, opened_at, failed_reason
       FROM communications WHERE enrollment_id=? ORDER BY created_at ASC`,
      [enrollId]
    ),
  ]);
  ok(res, { enrollment, steps, comms });
}

export async function meta(req, res) {
  const [sources, agents, stages, templates, campaigns] = await Promise.all([
    q('SELECT id,name,slug,category FROM lead_sources WHERE is_active=1 ORDER BY name'),
    q("SELECT id,name,email,role FROM users WHERE role IN ('agent','manager','admin','superadmin') AND is_active=1 ORDER BY name"),
    q('SELECT * FROM pipeline_stages WHERE is_active=1 ORDER BY stage_order'),
    q("SELECT id,name,channel,subject,body,wa_template_id,status,integration_account_id FROM templates WHERE status!='archived' AND company_id=? ORDER BY channel,name", [req.companyId]),
    q("SELECT id,name,status FROM campaigns WHERE status IN ('active','draft','paused') AND company_id=? ORDER BY name", [req.companyId])
  ]);
  ok(res, { sources, agents, stages, templates, campaigns });
}
