import { one, q, run, scalar } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';

export async function index(req, res) {
  const where = ['1=1'];
  const params = [];
  if (req.query.channel) { where.push('t.channel=?'); params.push(req.query.channel); }
  if (req.query.q) {
    where.push('(t.name LIKE ? OR t.subject LIKE ?)');
    params.push(`%${req.query.q}%`, `%${req.query.q}%`);
  }
  const templates = await q(
    `SELECT t.*, u.name AS created_by_name FROM templates t LEFT JOIN users u ON u.id=t.created_by
     WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC LIMIT 100`,
    params
  );
  ok(res, { templates, channel: req.query.channel || '', search: req.query.q || '' });
}

export async function store(req, res) {
  const name = String(req.body.name || '').trim();
  const body = String(req.body.body || '');
  const channel = req.body.channel || 'email';
  if (!name || !body) return fail(res, 'Name and body are required.', 422);
  if (channel === 'whatsapp' && !String(req.body.wa_template_id || '').trim()) {
    return fail(res, 'Please select a WhatsApp template from Anantya.', 422);
  }
  const result = await run(
    "INSERT INTO templates (name,channel,subject,body,wa_template_id,status,created_by) VALUES (?,?,?,?,?,'active',?)",
    [name, channel, req.body.subject || null, body, req.body.wa_template_id || null, req.user.id]
  );
  ok(res, { id: result.insertId }, 'Template created.');
}

export async function syncWhatsApp(req, res) {
  const { getSetting } = await import('../services/settings.service.js');
  const apiKey = req.query.key || req._anantya_override_key || await getSetting('wa_anantya_api_key');
  if (!apiKey) return fail(res, 'Anantya API key not configured.', 422);

  const response = await fetch('https://apiv1.anantya.ai/api/Campaign/GetTemplates', {
    headers: { accept: '*/*', 'X-Api-Key': apiKey }
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch {
    return fail(res, `Anantya returned non-JSON (HTTP ${response.status}).`, 502, text.slice(0, 300));
  }
  const success = data.isSuccess ?? data.IsSuccess ?? response.ok;
  if (!success) return fail(res, data.message || data.Message || 'Anantya error.', response.status || 502);

  const raw = data.dataObj || data.DataObj || data.data || [];
  const saveMode = req.query.save === '1'; // explicit ?save=1 required to upsert into DB

  let imported = 0, skipped = 0;
  const result = [];

  for (const t of raw) {
    // Extract body — Anantya uses msgText; fallback to components array (Meta format)
    let body = t.msgText || t.MsgText || t.body || t.Body || t.templateBody || t.TemplateBody || '';
    if (!body && Array.isArray(t.components || t.Components)) {
      const comps = t.components || t.Components || [];
      const bodyComp = comps.find(c => (c.type || c.Type || '').toUpperCase() === 'BODY');
      body = bodyComp?.text || bodyComp?.Text || '';
    }
    const waId   = String(t.id || t.templateId || t.TemplateId || t.template_id || '');
    const name   = String(t.name || t.templateName || t.TemplateName || t.Name || waId || '').trim();
    const status = String(t.status || t.Status || 'APPROVED').toUpperCase();
    const mediaUrl = t.mediaUrl || t.MediaUrl || t.header_url || null;

    const tplStatus = status === 'APPROVED' ? 'active' : 'draft';

    result.push({ waId, name, status, body: body.slice(0, 200) });

    if (!saveMode || !waId) { skipped++; continue; }

    // Upsert: if wa_template_id already exists, update; else insert
    const existing = await one(
      "SELECT id FROM templates WHERE wa_template_id=? AND channel IN ('whatsapp','rcs') LIMIT 1",
      [waId]
    );
    if (existing) {
      await run(
        'UPDATE templates SET name=?,body=?,media_url=?,status=?,updated_at=NOW() WHERE id=?',
        [name, body, mediaUrl, tplStatus, existing.id]
      );
    } else {
      await run(
        "INSERT INTO templates (name,channel,body,wa_template_id,media_url,status,created_by) VALUES (?,?,?,?,?,?,?)",
        [name, 'whatsapp', body, waId, mediaUrl, tplStatus, req.user?.id || 1]
      );
    }
    imported++;
  }

  ok(res, { imported, skipped, total: raw.length, templates: result }, `Synced ${imported} templates from Anantya.`);
}

export async function show(req, res) {
  const template = await one('SELECT * FROM templates WHERE id=? LIMIT 1', [Number(req.params.id)]);
  if (!template) return fail(res, 'Template not found.', 404);
  ok(res, { template });
}

export async function update(req, res) {
  const name = String(req.body.name || '').trim();
  const body = String(req.body.body || '');
  if (!name || !body) return fail(res, 'Name and body are required.', 422);
  await run('UPDATE templates SET name=?,subject=?,body=?,wa_template_id=?,updated_at=NOW() WHERE id=?', [
    name, req.body.subject || null, body, req.body.wa_template_id || null, Number(req.params.id)
  ]);
  ok(res, null, 'Template updated.');
}

export async function destroy(req, res) {
  const inUse = Number(await scalar('SELECT COUNT(*) FROM workflow_steps WHERE template_id=?', [Number(req.params.id)]));
  if (inUse > 0) return fail(res, 'Template is in use by a workflow step - cannot delete.', 422);
  await run('DELETE FROM templates WHERE id=?', [Number(req.params.id)]);
  ok(res, null, 'Template deleted.');
}
