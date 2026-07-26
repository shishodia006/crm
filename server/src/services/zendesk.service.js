import crypto from 'crypto';
import { one, run, q } from '../db/pool.js';
import { decryptValue } from '../utils/crypto.js';
import { safeEquals } from '../utils/crypto.js';
import { getSetting, saveCompanySetting } from './settings.service.js';
import { normalizeImportRow, processLead } from './lead.service.js';

async function zendeskFetch(companyId, path, opts = {}) {
  const subdomain = await getSetting('zendesk_subdomain', '', companyId);
  const email = await getSetting('zendesk_email', '', companyId);
  const token = await getSetting('zendesk_api_token', '', companyId);
  if (!subdomain || !email || !token) throw new Error('Zendesk is not connected — add your subdomain, email and API token first.');
  const auth = Buffer.from(`${email}/token:${token}`).toString('base64');
  const url = path.startsWith('http') ? path : `https://${subdomain}.zendesk.com/api/v2${path}`;
  const response = await fetch(url, {
    method: opts.method || 'GET',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: opts.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.description || `Zendesk API error (HTTP ${response.status})`);
  return data;
}

async function fetchAllEndUsers(companyId) {
  const users = [];
  let path = '/users.json?role=end-user&per_page=100';
  while (path) {
    const data = await zendeskFetch(companyId, path);
    users.push(...(data.users || []));
    path = data.next_page || null;
    if (path) await new Promise((r) => setTimeout(r, 200));
  }
  return users;
}

let _zendeskSourceId = null;
async function ensureZendeskSourceId() {
  if (_zendeskSourceId) return _zendeskSourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='zendesk' LIMIT 1");
  if (existing) { _zendeskSourceId = Number(existing.id); return _zendeskSourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('Zendesk','zendesk','external')");
  _zendeskSourceId = Number(result.insertId);
  return _zendeskSourceId;
}

function mapZendeskUserToLead(user) {
  return normalizeImportRow({
    name: user.name || user.email || 'Zendesk User',
    email: user.email || '',
    mobile: user.phone || '',
    'Zendesk User ID': user.id ?? '',
  });
}

async function resolveCompanyByZendeskKey(webhookKey) {
  if (!webhookKey) return null;
  const rows = await q("SELECT company_id, `value` FROM company_settings WHERE `key`='zendesk_webhook_key' AND `value`<>''");
  for (const row of rows) {
    if (decryptValue(row.value) === webhookKey) return Number(row.company_id);
  }
  return null;
}

// Registers a Webhook + a Trigger that fires it on every new ticket — both are
// best-effort (wrapped so a failure here never blocks Connect succeeding);
// Sync Now always works regardless of whether this succeeded.
async function registerZendeskWebhookAndTrigger(companyId, webhookKey) {
  const base = (await getSetting('zendesk_webhook_base_url', '', companyId)).replace(/\/+$/, '');
  if (!base) return 'skipped';

  const endpoint = `${base}/webhook/zendesk/${webhookKey}`;
  const webhook = await zendeskFetch(companyId, '/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        name: 'Dot Domino CRM Lead Sync',
        endpoint,
        http_method: 'POST',
        request_format: 'json',
        status: 'active',
        subscriptions: ['conditional_ticket_events'],
      },
    }),
  });
  const webhookId = webhook.webhook?.id;
  if (!webhookId) throw new Error('Zendesk did not return a webhook id.');

  const secretData = await zendeskFetch(companyId, `/webhooks/${webhookId}/signing_secret`);
  const signingSecret = secretData.signing_secret?.secret || '';

  const bodyTemplate = JSON.stringify({
    ticket_id: '{{ticket.id}}',
    requester_email: '{{ticket.requester.email}}',
    requester_name: '{{ticket.requester.name}}',
    requester_phone: '{{ticket.requester.phone}}',
    subject: '{{ticket.title}}',
  });
  const trigger = await zendeskFetch(companyId, '/triggers', {
    method: 'POST',
    body: JSON.stringify({
      trigger: {
        title: 'Dot Domino CRM - New Ticket Sync',
        conditions: { all: [{ field: 'status', operator: 'is', value: 'new' }] },
        actions: [{ field: 'notification_webhook', value: [String(webhookId), bodyTemplate] }],
      },
    }),
  });

  await saveCompanySetting(companyId, 'zendesk_webhook_signing_secret', signingSecret, 'sources');
  await saveCompanySetting(companyId, 'zendesk_webhook_id', String(webhookId), 'sources');
  await saveCompanySetting(companyId, 'zendesk_trigger_id', String(trigger.trigger?.id || ''), 'sources');
  return 'registered';
}

export async function verifyAndActivateZendesk(companyId) {
  const subdomain = await getSetting('zendesk_subdomain', '', companyId);
  if (!subdomain) throw new Error('Enter your Zendesk subdomain, email and API token first.');

  const me = await zendeskFetch(companyId, '/users/me.json');
  if (!me.user) throw new Error('Could not verify Zendesk credentials — check the subdomain, email and API token.');

  let webhookKey = await getSetting('zendesk_webhook_key', '', companyId);
  if (!webhookKey) {
    webhookKey = crypto.randomBytes(16).toString('hex');
    await saveCompanySetting(companyId, 'zendesk_webhook_key', webhookKey, 'sources');
  }

  let webhookStatus = 'skipped';
  try {
    webhookStatus = await registerZendeskWebhookAndTrigger(companyId, webhookKey);
  } catch (err) {
    console.error('[zendesk] webhook/trigger registration failed:', err.message);
    webhookStatus = 'failed';
  }

  const configJson = JSON.stringify({ name: `${subdomain}.zendesk.com` });
  const existing = await one('SELECT id FROM integrations WHERE company_id=? AND slug=? LIMIT 1', [companyId, 'zendesk']);
  if (existing) await run('UPDATE integrations SET is_active=1, config=?, updated_at=NOW() WHERE id=?', [configJson, existing.id]);
  else await run('INSERT INTO integrations (company_id,name,slug,type,is_active,config) VALUES (?,?,?,?,1,?)', [companyId, 'Zendesk', 'zendesk', 'communication', configJson]);
  await saveCompanySetting(companyId, 'zendesk_connected_account', `${subdomain}.zendesk.com`, 'sources');

  return { account: `${subdomain}.zendesk.com`, webhookKey, webhookStatus };
}

export async function disconnectZendesk(companyId) {
  try {
    const webhookId = await getSetting('zendesk_webhook_id', '', companyId);
    const triggerId = await getSetting('zendesk_trigger_id', '', companyId);
    if (triggerId) await zendeskFetch(companyId, `/triggers/${triggerId}`, { method: 'DELETE' }).catch(() => {});
    if (webhookId) await zendeskFetch(companyId, `/webhooks/${webhookId}`, { method: 'DELETE' }).catch(() => {});
  } catch (err) {
    console.error('[zendesk] failed to clean up webhook/trigger during disconnect:', err.message);
  }
  await run("UPDATE integrations SET is_active=0, updated_at=NOW() WHERE company_id=? AND slug='zendesk'", [companyId]);
  await saveCompanySetting(companyId, 'zendesk_connected_account', '', 'sources');
}

export async function syncZendeskLeads(companyId, req) {
  const users = await fetchAllEndUsers(companyId);
  const sourceId = await ensureZendeskSourceId();
  const summary = { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  for (const user of users) {
    summary.total += 1;
    const normalized = mapZendeskUserToLead(user);
    const result = await processLead(normalized, sourceId, null, req, undefined, { skipWelcomeTask: true });
    if (result.success) result.is_duplicate ? summary.duplicates += 1 : summary.imported += 1;
    else {
      summary.failed += 1;
      summary.errors.push(`User ${user.id}: ${Object.values(result.errors).join(', ')}`);
    }
  }

  if (summary.imported > 0) {
    try {
      await run(
        `INSERT INTO tasks (company_id, title, description, priority, due_at) VALUES (?, ?, ?, 'high', NOW())`,
        [companyId, `Review ${summary.imported} leads from Zendesk`, `Synced ${summary.imported} new end-user(s) from your connected Zendesk account — review and reach out.`]
      );
    } catch (err) {
      console.error('[syncZendeskLeads] summary task creation failed:', err);
    }
  }

  return summary;
}

// Verifies Zendesk's HMAC-SHA256 (base64) signature over timestamp+body, using
// the signing secret Zendesk generated for this specific webhook — separate
// from the URL-embedded key, which only resolves *which company* this is.
export async function handleZendeskWebhook(req, res) {
  const companyId = await resolveCompanyByZendeskKey(req.params.webhookKey);
  if (!companyId) return res.status(404).json({ status: 'unknown_key' });

  const secret = await getSetting('zendesk_webhook_signing_secret', '', companyId);
  const signature = req.get('x-zendesk-webhook-signature') || '';
  const timestamp = req.get('x-zendesk-webhook-signature-timestamp') || '';
  const expected = secret ? crypto.createHmac('sha256', secret).update(`${timestamp}${req.rawBody || ''}`, 'utf8').digest('base64') : '';
  if (!secret || !safeEquals(expected, signature)) return res.status(401).json({ status: 'invalid_signature' });

  const logResult = await run('INSERT INTO webhook_logs (source,event,payload,status,ip) VALUES (?,?,?,?,?)',
    ['zendesk', 'ticket_created', req.rawBody || JSON.stringify(req.body || {}), 'received', req.socket?.remoteAddress || '0.0.0.0']);

  try {
    const payload = req.body || {};
    let recorded = false;
    if (payload.requester_email || payload.requester_phone) {
      const normalized = normalizeImportRow({
        name: payload.requester_name || payload.requester_email || 'Zendesk User',
        email: payload.requester_email || '',
        mobile: payload.requester_phone || '',
        product_interest: payload.subject || '',
        'Zendesk Ticket ID': payload.ticket_id ?? '',
      });
      const sourceId = await ensureZendeskSourceId();
      const fakeReq = { companyId, headers: req.headers, socket: req.socket };
      const result = await processLead(normalized, sourceId, null, fakeReq);
      recorded = result.success;
    }
    await run('UPDATE webhook_logs SET status=? WHERE id=?', [recorded ? 'processed' : 'ignored', logResult.insertId]);
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[zendesk webhook] processing error:', err);
    await run('UPDATE webhook_logs SET status=?, error=? WHERE id=?', ['failed', String(err.stack || err.message || err).slice(0, 2000), logResult.insertId]).catch(() => {});
    res.status(200).json({ status: 'error', message: 'Logged for review.' });
  }
}
