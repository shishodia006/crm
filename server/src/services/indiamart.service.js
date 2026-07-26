import { one, run } from '../db/pool.js';
import { getSetting, ensureWebhookKey, resolveCompanyByWebhookKey } from './settings.service.js';
import { normalizeImportRow, processLead } from './lead.service.js';

let _indiamartSourceId = null;
async function ensureIndiamartSourceId() {
  if (_indiamartSourceId) return _indiamartSourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='indiamart' LIMIT 1");
  if (existing) { _indiamartSourceId = Number(existing.id); return _indiamartSourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('IndiaMart','indiamart','external')");
  _indiamartSourceId = Number(result.insertId);
  return _indiamartSourceId;
}

function mapIndiamartLeadToImport(row) {
  return normalizeImportRow({
    name: row.SENDER_NAME || '',
    email: row.SENDER_EMAIL || '',
    mobile: row.SENDER_MOBILE || row.SENDER_MOBILE_ALT || '',
    company: row.SENDER_COMPANY || '',
    city: row.SENDER_CITY || '',
    state: row.SENDER_STATE || '',
    country: row.SENDER_COUNTRY_ISO || 'India',
    pincode: row.SENDER_PINCODE || '',
    product_interest: row.QUERY_PRODUCT_NAME || row.QUERY_MESSAGE || '',
    'IndiaMart Query ID': row.UNIQUE_QUERY_ID ?? '',
  });
}

function formatIndiamartTime(date) {
  // IndiaMart's Lead Manager API expects "DD-MMM-YYYY HH:MM:SS", e.g. 01-Jan-2026 00:00:00
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}-${months[date.getMonth()]}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

// IndiaMart's documented Lead Manager API only accepts a bounded time window per
// call (used conservatively here at 24h) — pulling further back means walking
// backwards in 24h slices rather than one huge range.
async function fetchIndiamartLeadsInRange(companyId, startDate, endDate) {
  const key = await getSetting('indiamart_key', '', companyId);
  if (!key) throw new Error('IndiaMart is not connected — add your CRM Key first.');
  const params = new URLSearchParams({
    glusr_crm_key: key,
    start_time: formatIndiamartTime(startDate),
    end_time: formatIndiamartTime(endDate),
  });
  const response = await fetch(`https://mapi.indiamart.com/wservce/crm/crmListing/v2/?${params}`);
  const data = await response.json().catch(() => ({}));
  if (data.CODE !== undefined && Number(data.CODE) !== 200) throw new Error(data.MESSAGE || 'IndiaMart API error');
  return data.RESPONSE || [];
}

async function importIndiamartRows(companyId, req, rows) {
  const sourceId = await ensureIndiamartSourceId();
  const summary = { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  for (const row of rows) {
    summary.total += 1;
    const normalized = mapIndiamartLeadToImport(row);
    const result = await processLead(normalized, sourceId, null, req, undefined, { skipWelcomeTask: true });
    if (result.success) result.is_duplicate ? summary.duplicates += 1 : summary.imported += 1;
    else {
      summary.failed += 1;
      summary.errors.push(`Query ${row.UNIQUE_QUERY_ID}: ${Object.values(result.errors).join(', ')}`);
    }
  }
  if (summary.imported > 0) {
    try {
      await run(
        `INSERT INTO tasks (company_id, title, description, priority, due_at) VALUES (?, ?, ?, 'high', NOW())`,
        [companyId, `Review ${summary.imported} leads from IndiaMart`, `Synced ${summary.imported} new lead(s) from IndiaMart — review and reach out.`]
      );
    } catch (err) {
      console.error('[indiamart] summary task creation failed:', err);
    }
  }
  return summary;
}

// Manual "Sync Now": pulls the last 7 days in 24h slices (safe under whatever
// the exact per-call window limit is) rather than one large range.
export async function syncIndiamartLeads(companyId, req) {
  const end = new Date();
  const allRows = [];
  for (let i = 0; i < 7; i++) {
    const sliceEnd = new Date(end.getTime() - i * 24 * 3600 * 1000);
    const sliceStart = new Date(sliceEnd.getTime() - 24 * 3600 * 1000);
    allRows.push(...(await fetchIndiamartLeadsInRange(companyId, sliceStart, sliceEnd)));
    await new Promise((r) => setTimeout(r, 300));
  }
  return importIndiamartRows(companyId, req, allRows);
}

export async function getOrCreateIndiamartWebhookKey(companyId) {
  return ensureWebhookKey(companyId, 'indiamart_webhook_key');
}

// IndiaMart's "push" leads (registered manually in their Lead Manager panel,
// same URL as displayed in Settings) arrive with no signature at all — the
// per-company key baked into the URL path is the only authentication, same
// reasoning as Mailchimp/HubSpot above.
export async function handleIndiamartWebhook(req, res) {
  const companyId = await resolveCompanyByWebhookKey('indiamart_webhook_key', req.params.webhookKey);
  if (!companyId) return res.status(404).json({ status: 'unknown_key' });

  const logResult = await run('INSERT INTO webhook_logs (source,event,payload,status,ip) VALUES (?,?,?,?,?)',
    ['indiamart', 'lead_push', req.rawBody || JSON.stringify(req.body || {}), 'received', req.socket?.remoteAddress || '0.0.0.0']);

  try {
    const payload = req.body || {};
    const normalized = mapIndiamartLeadToImport(payload);
    const sourceId = await ensureIndiamartSourceId();
    const fakeReq = { companyId, headers: req.headers, socket: req.socket };
    const result = await processLead(normalized, sourceId, null, fakeReq);
    await run('UPDATE webhook_logs SET status=? WHERE id=?', [result.success ? 'processed' : 'ignored', logResult.insertId]);
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[indiamart webhook] processing error:', err);
    await run('UPDATE webhook_logs SET status=?, error=? WHERE id=?', ['failed', String(err.stack || err.message || err).slice(0, 2000), logResult.insertId]).catch(() => {});
    res.status(200).json({ status: 'error', message: 'Logged for review.' });
  }
}
