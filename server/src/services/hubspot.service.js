import crypto from 'crypto';
import { one, run, q } from '../db/pool.js';
import { decryptValue } from '../utils/crypto.js';
import { getSetting, saveCompanySetting } from './settings.service.js';
import { normalizeImportRow, processLead } from './lead.service.js';

const CONTACT_PROPERTIES = 'firstname,lastname,email,phone,company,city,state,country,jobtitle';

async function hubspotFetch(companyId, path, opts = {}) {
  const token = await getSetting('hubspot_access_token', '', companyId);
  if (!token) throw new Error('HubSpot is not connected — add your Private App access token first.');
  const url = path.startsWith('http') ? path : `https://api.hubapi.com${path}`;
  const response = await fetch(url, {
    method: opts.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: opts.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `HubSpot API error (HTTP ${response.status})`);
  return data;
}

async function fetchAllContacts(companyId) {
  const contacts = [];
  let after = null;
  do {
    const params = new URLSearchParams({ limit: '100', properties: CONTACT_PROPERTIES });
    if (after) params.set('after', after);
    const data = await hubspotFetch(companyId, `/crm/v3/objects/contacts?${params}`);
    contacts.push(...(data.results || []));
    after = data.paging?.next?.after || null;
    if (after) await new Promise((r) => setTimeout(r, 200));
  } while (after);
  return contacts;
}

let _hubspotSourceId = null;
async function ensureHubspotSourceId() {
  if (_hubspotSourceId) return _hubspotSourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='hubspot' LIMIT 1");
  if (existing) { _hubspotSourceId = Number(existing.id); return _hubspotSourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('HubSpot','hubspot','external')");
  _hubspotSourceId = Number(result.insertId);
  return _hubspotSourceId;
}

function mapHubspotContactToLead(contact) {
  const p = contact.properties || {};
  const name = [p.firstname, p.lastname].filter(Boolean).join(' ').trim() || p.email || p.phone || 'HubSpot Contact';
  return normalizeImportRow({
    name,
    email: p.email || '',
    mobile: p.phone || '',
    company: p.company || '',
    designation: p.jobtitle || '',
    city: p.city || '',
    state: p.state || '',
    country: p.country || 'India',
    'HubSpot Contact ID': contact.id ?? '',
  });
}

// The webhook route resolves which company a HubSpot event belongs to via a
// random per-company key baked into the webhook URL (/webhook/hubspot/:webhookKey)
// — the same convention integration_accounts already uses elsewhere in this
// codebase — rather than trying to match HubSpot's portalId, which would need an
// extra "who am I" API call this integration doesn't otherwise need.
async function resolveCompanyByHubspotKey(webhookKey) {
  if (!webhookKey) return null;
  const rows = await q("SELECT company_id, `value` FROM company_settings WHERE `key`='hubspot_webhook_key' AND `value`<>''");
  for (const row of rows) {
    if (decryptValue(row.value) === webhookKey) return Number(row.company_id);
  }
  return null;
}

export async function verifyAndActivateHubspot(companyId) {
  const token = await getSetting('hubspot_access_token', '', companyId);
  if (!token) throw new Error('Enter your HubSpot Private App access token first.');

  // A cheap read confirms the token actually works before we mark the
  // integration active — same role Shopify's shop.json check plays.
  await hubspotFetch(companyId, '/crm/v3/objects/contacts?limit=1');

  let webhookKey = await getSetting('hubspot_webhook_key', '', companyId);
  if (!webhookKey) {
    webhookKey = crypto.randomBytes(16).toString('hex');
    await saveCompanySetting(companyId, 'hubspot_webhook_key', webhookKey, 'sources');
  }

  const configJson = JSON.stringify({ name: 'Connected' });
  const existing = await one('SELECT id FROM integrations WHERE company_id=? AND slug=? LIMIT 1', [companyId, 'hubspot']);
  if (existing) await run('UPDATE integrations SET is_active=1, config=?, updated_at=NOW() WHERE id=?', [configJson, existing.id]);
  else await run('INSERT INTO integrations (company_id,name,slug,type,is_active,config) VALUES (?,?,?,?,1,?)', [companyId, 'HubSpot', 'hubspot', 'crm', configJson]);
  await saveCompanySetting(companyId, 'hubspot_connected', '1', 'sources');

  return { webhookKey };
}

export async function disconnectHubspot(companyId) {
  await run("UPDATE integrations SET is_active=0, updated_at=NOW() WHERE company_id=? AND slug='hubspot'", [companyId]);
  await saveCompanySetting(companyId, 'hubspot_connected', '', 'sources');
}

export async function syncHubspotLeads(companyId, req) {
  const contacts = await fetchAllContacts(companyId);
  const sourceId = await ensureHubspotSourceId();
  const summary = { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  for (const contact of contacts) {
    summary.total += 1;
    const normalized = mapHubspotContactToLead(contact);
    const result = await processLead(normalized, sourceId, null, req, undefined, { skipWelcomeTask: true });
    if (result.success) result.is_duplicate ? summary.duplicates += 1 : summary.imported += 1;
    else {
      summary.failed += 1;
      summary.errors.push(`Contact ${contact.id}: ${Object.values(result.errors).join(', ')}`);
    }
  }

  if (summary.imported > 0) {
    try {
      await run(
        `INSERT INTO tasks (company_id, title, description, priority, due_at) VALUES (?, ?, ?, 'high', NOW())`,
        [companyId, `Review ${summary.imported} leads from HubSpot`, `Synced ${summary.imported} new contact(s) from your connected HubSpot account — review and reach out.`]
      );
    } catch (err) {
      console.error('[syncHubspotLeads] summary task creation failed:', err);
    }
  }

  return summary;
}

// Verifies HubSpot's v3 webhook signature: base64(HMAC-SHA256(clientSecret,
// method + fullUrl + body + timestamp)), with a 5-minute freshness window
// against replay. fullUrl must exactly match the address configured in
// HubSpot's Webhooks UI, which is why the base URL is a setting rather than
// something reconstructed from request headers (proxies/tunnels can't be
// trusted to report the original scheme/host consistently).
export async function handleHubspotWebhook(req, res) {
  const companyId = await resolveCompanyByHubspotKey(req.params.webhookKey);
  if (!companyId) return res.status(404).json({ status: 'unknown_key' });

  const secret = await getSetting('hubspot_webhook_secret', '', companyId);
  const timestamp = req.get('x-hubspot-request-timestamp') || '';
  const signature = req.get('x-hubspot-signature-v3') || '';
  const base = (await getSetting('hubspot_webhook_base_url', '', companyId)).replace(/\/+$/, '');
  const fullUrl = `${base}/webhook/hubspot/${req.params.webhookKey}`;

  const tooOld = !timestamp || Date.now() - Number(timestamp) > 5 * 60 * 1000;
  const expected = secret ? crypto.createHmac('sha256', secret).update(`POST${fullUrl}${req.rawBody || ''}${timestamp}`, 'utf8').digest('base64') : '';
  if (!secret || tooOld || expected !== signature) return res.status(401).json({ status: 'invalid_signature' });

  const logResult = await run('INSERT INTO webhook_logs (source,event,payload,status,ip) VALUES (?,?,?,?,?)',
    ['hubspot', 'contact_event', req.rawBody || JSON.stringify(req.body || {}), 'received', req.socket?.remoteAddress || '0.0.0.0']);

  try {
    const events = Array.isArray(req.body) ? req.body : [];
    const sourceId = await ensureHubspotSourceId();
    const fakeReq = { companyId, headers: req.headers, socket: req.socket };
    let recorded = 0;
    for (const event of events) {
      if (event.subscriptionType !== 'contact.creation' && event.subscriptionType !== 'contact.propertyChange') continue;
      const contact = await hubspotFetch(companyId, `/crm/v3/objects/contacts/${event.objectId}?properties=${CONTACT_PROPERTIES}`);
      const normalized = mapHubspotContactToLead(contact);
      const result = await processLead(normalized, sourceId, null, fakeReq);
      if (result.success) recorded += 1;
    }
    await run('UPDATE webhook_logs SET status=? WHERE id=?', [recorded > 0 ? 'processed' : 'ignored', logResult.insertId]);
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[hubspot webhook] processing error:', err);
    await run('UPDATE webhook_logs SET status=?, error=? WHERE id=?', ['failed', String(err.stack || err.message || err).slice(0, 2000), logResult.insertId]).catch(() => {});
    res.status(200).json({ status: 'error', message: 'Logged for review.' });
  }
}
