import { one, run } from '../db/pool.js';
import { getSetting, ensureWebhookKey, resolveCompanyByWebhookKey } from './settings.service.js';
import { normalizeImportRow, processLead } from './lead.service.js';

let _googleAdsSourceId = null;
async function ensureGoogleAdsSourceId() {
  if (_googleAdsSourceId) return _googleAdsSourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='google_ads' LIMIT 1");
  if (existing) { _googleAdsSourceId = Number(existing.id); return _googleAdsSourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('Google Ads Lead Form','google_ads','advertising')");
  _googleAdsSourceId = Number(result.insertId);
  return _googleAdsSourceId;
}

// Google Ads Lead Form Extensions deliver leads as user_column_data: an array
// of {column_id, string_value} pairs (column_id values like FULL_NAME,
// EMAIL, PHONE_NUMBER) rather than a flat object — flatten first, then
// lowercase+space the keys so the same shared alias matching used for
// spreadsheet imports recognizes them (FULL_NAME -> "full name" -> matches).
function mapGoogleAdsLeadToImport(payload) {
  const flat = {};
  for (const field of (payload.user_column_data || [])) {
    if (field.column_id) flat[field.column_id] = field.string_value || '';
  }
  const spaced = Object.fromEntries(Object.entries(flat).map(([k, v]) => [k.replace(/_/g, ' ').toLowerCase(), v]));
  spaced['Google Ads Lead ID'] = payload.lead_id ?? '';
  spaced['Campaign ID'] = payload.campaign_id ?? '';
  return normalizeImportRow(spaced);
}

export async function getOrCreateGoogleAdsWebhookKey(companyId) {
  return ensureWebhookKey(companyId, 'google_ads_webhook_key');
}

// Google's Lead Form webhook integration needs no OAuth/Developer Token at
// all — it's configured directly on the Lead Form asset in the Google Ads UI
// with a webhook URL + a "key" you choose there, which Google echoes back in
// every payload's `google_key` field. The URL-embedded key routes to the right
// company; matching `google_key` against a stored secret is the actual
// authentication, exactly mirroring how Google's own docs describe verifying
// these webhooks.
export async function handleGoogleAdsWebhook(req, res) {
  const companyId = await resolveCompanyByWebhookKey('google_ads_webhook_key', req.params.webhookKey);
  if (!companyId) return res.status(404).json({ status: 'unknown_key' });

  const payload = req.body || {};
  const expectedKey = await getSetting('google_ads_webhook_secret', '', companyId);
  if (!expectedKey || payload.google_key !== expectedKey) {
    return res.status(401).json({ status: 'invalid_key' });
  }

  const logResult = await run('INSERT INTO webhook_logs (source,event,payload,status,ip) VALUES (?,?,?,?,?)',
    ['google_ads', 'lead_form', req.rawBody || JSON.stringify(payload), 'received', req.socket?.remoteAddress || '0.0.0.0']);

  try {
    if (payload.is_test) {
      // Google Ads sends a test submission when you click "Test lead" in the UI —
      // useful to confirm the endpoint is reachable, but shouldn't create a lead.
      await run('UPDATE webhook_logs SET status=? WHERE id=?', ['ignored', logResult.insertId]);
      return res.status(200).json({ status: 'ok', test: true });
    }
    const normalized = mapGoogleAdsLeadToImport(payload);
    const sourceId = await ensureGoogleAdsSourceId();
    const fakeReq = { companyId, headers: req.headers, socket: req.socket };
    const result = await processLead(normalized, sourceId, null, fakeReq);
    await run('UPDATE webhook_logs SET status=? WHERE id=?', [result.success ? 'processed' : 'ignored', logResult.insertId]);
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[google ads webhook] processing error:', err);
    await run('UPDATE webhook_logs SET status=?, error=? WHERE id=?', ['failed', String(err.stack || err.message || err).slice(0, 2000), logResult.insertId]).catch(() => {});
    res.status(200).json({ status: 'error', message: 'Logged for review.' });
  }
}
