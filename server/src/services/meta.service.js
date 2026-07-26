import crypto from 'crypto';
import { one, run } from '../db/pool.js';
import { safeEquals } from '../utils/crypto.js';
import { getSetting, ensureWebhookKey, resolveCompanyByWebhookKey } from './settings.service.js';
import { normalizeImportRow, processLead } from './lead.service.js';

const GRAPH_API_VERSION = 'v19.0';

let _metaSourceId = null;
async function ensureMetaSourceId() {
  if (_metaSourceId) return _metaSourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='meta' LIMIT 1");
  if (existing) { _metaSourceId = Number(existing.id); return _metaSourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('Meta / Facebook Lead Ads','meta','advertising')");
  _metaSourceId = Number(result.insertId);
  return _metaSourceId;
}

async function fetchMetaLeadFields(companyId, leadgenId) {
  const token = await getSetting('meta_ads_token', '', companyId);
  if (!token) throw new Error('Meta Lead Ads is not connected — add your Page Access Token first.');
  const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${leadgenId}?access_token=${encodeURIComponent(token)}`);
  const data = await response.json().catch(() => ({}));
  if (data.error) throw new Error(data.error.message || 'Meta Graph API error');
  return data;
}

// Meta lead form field names use underscores (full_name, phone_number,
// company_name) rather than the spaced headers normalizeImportRow's alias list
// expects (from spreadsheet-style imports) — swapping underscores for spaces
// lets the same shared alias matching work without duplicating the alias list.
function mapMetaLeadToImport(leadData) {
  const flat = {};
  for (const field of (leadData.field_data || [])) {
    flat[field.name] = (field.values || [])[0] || '';
  }
  const spaced = Object.fromEntries(Object.entries(flat).map(([k, v]) => [k.replace(/_/g, ' '), v]));
  spaced['Meta Leadgen ID'] = leadData.id ?? '';
  return normalizeImportRow(spaced);
}

export async function getOrCreateMetaWebhookKey(companyId) {
  return ensureWebhookKey(companyId, 'meta_webhook_key');
}

// Meta's webhook contract is two-part: a one-time GET handshake (hub.challenge)
// when you register the URL, then POSTs carrying only a leadgen_id — the actual
// field values must be fetched separately via the Graph API using the page
// token, which is why this can't just processLead the raw payload directly.
export async function handleMetaWebhook(req, res) {
  const companyId = await resolveCompanyByWebhookKey('meta_webhook_key', req.params.webhookKey);

  if (req.method === 'GET') {
    const mode = req.query['hub.mode'] || req.query.hub_mode;
    const token = req.query['hub.verify_token'] || req.query.hub_verify_token;
    const challenge = req.query['hub.challenge'] || req.query.hub_challenge || '';
    const verifyToken = companyId ? await getSetting('meta_verify_token', '', companyId) : '';
    if (companyId && mode === 'subscribe' && verifyToken && token === verifyToken) {
      return res.type('text/plain').send(String(challenge));
    }
    return res.status(403).send('Verification failed');
  }

  if (!companyId) return res.status(404).json({ status: 'unknown_key' });

  // The URL-embedded key already resolves/authenticates the company; when an
  // App Secret is also configured, verify Meta's own X-Hub-Signature-256 too
  // (defense in depth — this is the header Meta's docs describe for confirming
  // a payload wasn't tampered with in transit).
  const appSecret = await getSetting('meta_ads_secret', '', companyId);
  if (appSecret) {
    const signatureHeader = req.get('x-hub-signature-256') || '';
    const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(req.rawBody || '', 'utf8').digest('hex')}`;
    if (!safeEquals(expected, signatureHeader)) return res.status(401).json({ status: 'invalid_signature' });
  }

  const logResult = await run('INSERT INTO webhook_logs (source,event,payload,status,ip) VALUES (?,?,?,?,?)',
    ['meta', 'leadgen', req.rawBody || JSON.stringify(req.body || {}), 'received', req.socket?.remoteAddress || '0.0.0.0']);

  try {
    const entries = req.body?.entry || [];
    const sourceId = await ensureMetaSourceId();
    const fakeReq = { companyId, headers: req.headers, socket: req.socket };
    let recorded = 0;
    for (const entry of entries) {
      for (const change of (entry.changes || [])) {
        if (change.field !== 'leadgen' || !change.value?.leadgen_id) continue;
        const leadData = await fetchMetaLeadFields(companyId, change.value.leadgen_id);
        const normalized = mapMetaLeadToImport(leadData);
        const result = await processLead(normalized, sourceId, null, fakeReq);
        if (result.success) recorded += 1;
      }
    }
    await run('UPDATE webhook_logs SET status=? WHERE id=?', [recorded > 0 ? 'processed' : 'ignored', logResult.insertId]);
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[meta webhook] processing error:', err);
    await run('UPDATE webhook_logs SET status=?, error=? WHERE id=?', ['failed', String(err.stack || err.message || err).slice(0, 2000), logResult.insertId]).catch(() => {});
    res.status(200).json({ status: 'error', message: 'Logged for review.' });
  }
}
