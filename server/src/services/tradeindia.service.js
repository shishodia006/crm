import { one, run } from '../db/pool.js';
import { getSetting, ensureWebhookKey, resolveCompanyByWebhookKey } from './settings.service.js';
import { normalizeImportRow, processLead } from './lead.service.js';

let _tradeindiaSourceId = null;
async function ensureTradeindiaSourceId() {
  if (_tradeindiaSourceId) return _tradeindiaSourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='tradeindia' LIMIT 1");
  if (existing) { _tradeindiaSourceId = Number(existing.id); return _tradeindiaSourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('TradeIndia','tradeindia','external')");
  _tradeindiaSourceId = Number(result.insertId);
  return _tradeindiaSourceId;
}

// TradeIndia's push-lead payload field names aren't as consistently documented
// as IndiaMart's — this maps every commonly-seen variant defensively so a
// partial match still gets picked up. Verify against your TradeIndia account's
// actual payload sample the first time (visible in Webhook Logs) and adjust
// the field list below if needed.
function mapTradeindiaLeadToImport(row) {
  return normalizeImportRow({
    name: row.NAME || row.name || row.sender_name || row.contact_name || '',
    email: row.EMAIL || row.email || row.sender_email || '',
    mobile: row.MOBILE || row.mobile || row.sender_mobile || row.phone || '',
    company: row.COMPANY_NAME || row.company_name || row.company || '',
    city: row.CITY || row.city || '',
    state: row.STATE || row.state || '',
    country: row.COUNTRY || row.country || 'India',
    product_interest: row.PRODUCT_NAME || row.product_name || row.message || row.MESSAGE || '',
    'TradeIndia Lead ID': row.LEAD_ID || row.lead_id || row.id || '',
  });
}

async function importTradeindiaRows(companyId, req, rows) {
  const sourceId = await ensureTradeindiaSourceId();
  const summary = { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  for (const row of rows) {
    summary.total += 1;
    const normalized = mapTradeindiaLeadToImport(row);
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
        [companyId, `Review ${summary.imported} leads from TradeIndia`, `Synced ${summary.imported} new lead(s) from TradeIndia — review and reach out.`]
      );
    } catch (err) {
      console.error('[tradeindia] summary task creation failed:', err);
    }
  }
  return summary;
}

// Best-effort polling against TradeIndia's documented lead-listing endpoint.
// Lower confidence than IndiaMart's here — TradeIndia's exact response
// envelope varies by account type, so this reads a couple of plausible
// wrapper keys defensively. If Sync Now returns 0 despite leads existing,
// check the raw response shape against TradeIndia's current API docs.
export async function syncTradeindiaLeads(companyId, req) {
  const userId = await getSetting('tradeindia_user', '', companyId);
  const apiKey = await getSetting('tradeindia_key', '', companyId);
  if (!userId || !apiKey) throw new Error('TradeIndia is not connected — add your API key and User ID first.');

  const params = new URLSearchParams({ userid: userId, key: apiKey });
  const response = await fetch(`https://www.tradeindia.com/mapi/getbuyleadapi/?${params}`);
  const data = await response.json().catch(() => ({}));
  const rows = Array.isArray(data) ? data : (data.leads || data.data || data.RESPONSE || []);
  return importTradeindiaRows(companyId, req, rows);
}

export async function getOrCreateTradeindiaWebhookKey(companyId) {
  return ensureWebhookKey(companyId, 'tradeindia_webhook_key');
}

export async function handleTradeindiaWebhook(req, res) {
  const companyId = await resolveCompanyByWebhookKey('tradeindia_webhook_key', req.params.webhookKey);
  if (!companyId) return res.status(404).json({ status: 'unknown_key' });

  const logResult = await run('INSERT INTO webhook_logs (source,event,payload,status,ip) VALUES (?,?,?,?,?)',
    ['tradeindia', 'lead_push', req.rawBody || JSON.stringify(req.body || {}), 'received', req.socket?.remoteAddress || '0.0.0.0']);

  try {
    const normalized = mapTradeindiaLeadToImport(req.body || {});
    const sourceId = await ensureTradeindiaSourceId();
    const fakeReq = { companyId, headers: req.headers, socket: req.socket };
    const result = await processLead(normalized, sourceId, null, fakeReq);
    await run('UPDATE webhook_logs SET status=? WHERE id=?', [result.success ? 'processed' : 'ignored', logResult.insertId]);
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[tradeindia webhook] processing error:', err);
    await run('UPDATE webhook_logs SET status=?, error=? WHERE id=?', ['failed', String(err.stack || err.message || err).slice(0, 2000), logResult.insertId]).catch(() => {});
    res.status(200).json({ status: 'error', message: 'Logged for review.' });
  }
}
