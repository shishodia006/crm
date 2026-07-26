import { one, run } from '../db/pool.js';
import { getSetting, ensureWebhookKey, resolveCompanyByWebhookKey } from './settings.service.js';
import { normalizeImportRow, processLead } from './lead.service.js';

let _justdialSourceId = null;
async function ensureJustdialSourceId() {
  if (_justdialSourceId) return _justdialSourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='justdial' LIMIT 1");
  if (existing) { _justdialSourceId = Number(existing.id); return _justdialSourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('JustDial','justdial','external')");
  _justdialSourceId = Number(result.insertId);
  return _justdialSourceId;
}

// JustDial's lead payload field names aren't as consistently documented as
// IndiaMart's — mapped defensively across commonly-seen variants. Verify
// against your account's actual payload sample (visible in Webhook Logs) and
// adjust the field list below if a real push doesn't map correctly.
function mapJustdialLeadToImport(row) {
  return normalizeImportRow({
    name: row.name || row.NAME || row.customer_name || row.cust_name || '',
    email: row.email || row.EMAIL || row.customer_email || '',
    mobile: row.mobile || row.MOBILE || row.phone || row.customer_mobile || '',
    company: row.company || row.company_name || '',
    city: row.city || row.CITY || '',
    state: row.state || row.STATE || '',
    country: row.country || 'India',
    product_interest: row.message || row.query || row.enquiry || row.product || '',
    'JustDial Lead ID': row.lead_id || row.id || row.enquiry_id || '',
  });
}

async function importJustdialRows(companyId, req, rows) {
  const sourceId = await ensureJustdialSourceId();
  const summary = { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  for (const row of rows) {
    summary.total += 1;
    const normalized = mapJustdialLeadToImport(row);
    const result = await processLead(normalized, sourceId, null, req, undefined, { skipWelcomeTask: true });
    if (result.success) result.is_duplicate ? summary.duplicates += 1 : summary.imported += 1;
    else {
      summary.failed += 1;
      summary.errors.push(`Row ${summary.total}: ${Object.values(result.errors).join(', ')}`);
    }
  }
  if (summary.imported > 0) {
    try {
      await run(
        `INSERT INTO tasks (company_id, title, description, priority, due_at) VALUES (?, ?, ?, 'high', NOW())`,
        [companyId, `Review ${summary.imported} leads from JustDial`, `Synced ${summary.imported} new lead(s) from JustDial — review and reach out.`]
      );
    } catch (err) {
      console.error('[justdial] summary task creation failed:', err);
    }
  }
  return summary;
}

// Best-effort polling — lower confidence than IndiaMart's here since JustDial's
// public API surface for pulling leads isn't as consistently documented; the
// webhook path above is the more reliable option if your JustDial account
// supports lead push.
export async function syncJustdialLeads(companyId, req) {
  const login = await getSetting('justdial_login', '', companyId);
  const apiKey = await getSetting('justdial_api_key', '', companyId);
  if (!login || !apiKey) throw new Error('JustDial is not connected — add your API key and Login first.');

  const params = new URLSearchParams({ login, key: apiKey });
  const response = await fetch(`https://www.justdial.com/api/leadsapi/?${params}`);
  const data = await response.json().catch(() => ({}));
  const rows = Array.isArray(data) ? data : (data.leads || data.data || data.results || []);
  return importJustdialRows(companyId, req, rows);
}

export async function getOrCreateJustdialWebhookKey(companyId) {
  return ensureWebhookKey(companyId, 'justdial_webhook_key');
}

export async function handleJustdialWebhook(req, res) {
  const companyId = await resolveCompanyByWebhookKey('justdial_webhook_key', req.params.webhookKey);
  if (!companyId) return res.status(404).json({ status: 'unknown_key' });

  const logResult = await run('INSERT INTO webhook_logs (source,event,payload,status,ip) VALUES (?,?,?,?,?)',
    ['justdial', 'lead_push', req.rawBody || JSON.stringify(req.body || {}), 'received', req.socket?.remoteAddress || '0.0.0.0']);

  try {
    const normalized = mapJustdialLeadToImport(req.body || {});
    const sourceId = await ensureJustdialSourceId();
    const fakeReq = { companyId, headers: req.headers, socket: req.socket };
    const result = await processLead(normalized, sourceId, null, fakeReq);
    await run('UPDATE webhook_logs SET status=? WHERE id=?', [result.success ? 'processed' : 'ignored', logResult.insertId]);
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[justdial webhook] processing error:', err);
    await run('UPDATE webhook_logs SET status=?, error=? WHERE id=?', ['failed', String(err.stack || err.message || err).slice(0, 2000), logResult.insertId]).catch(() => {});
    res.status(200).json({ status: 'error', message: 'Logged for review.' });
  }
}
