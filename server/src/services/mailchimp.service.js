import crypto from 'crypto';
import { one, run, q } from '../db/pool.js';
import { decryptValue } from '../utils/crypto.js';
import { getSetting, saveCompanySetting } from './settings.service.js';
import { normalizeImportRow, processLead } from './lead.service.js';

// Mailchimp API keys are always "<hex>-usXX" — the suffix after the dash is the
// account's data center, which is also the subdomain every API call must hit.
function dcFromApiKey(apiKey) {
  return String(apiKey || '').split('-').pop();
}

async function mailchimpFetch(companyId, path, opts = {}) {
  const apiKey = await getSetting('mailchimp_api_key', '', companyId);
  if (!apiKey) throw new Error('Mailchimp is not connected — add your API key first.');
  const dc = dcFromApiKey(apiKey);
  const url = `https://${dc}.api.mailchimp.com/3.0${path}`;
  const response = await fetch(url, {
    method: opts.method || 'GET',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: opts.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || data.title || `Mailchimp API error (HTTP ${response.status})`);
  return data;
}

async function fetchAllSubscribedMembers(companyId) {
  const listId = await getSetting('mailchimp_list_id', '', companyId);
  if (!listId) throw new Error('No Mailchimp Audience/List ID configured.');
  const members = [];
  const count = 500;
  let offset = 0;
  while (true) {
    const data = await mailchimpFetch(companyId, `/lists/${listId}/members?count=${count}&offset=${offset}&status=subscribed`);
    members.push(...(data.members || []));
    if (!data.members || data.members.length < count) break;
    offset += count;
    await new Promise((r) => setTimeout(r, 300));
  }
  return members;
}

let _mailchimpSourceId = null;
async function ensureMailchimpSourceId() {
  if (_mailchimpSourceId) return _mailchimpSourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='mailchimp' LIMIT 1");
  if (existing) { _mailchimpSourceId = Number(existing.id); return _mailchimpSourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('Mailchimp','mailchimp','external')");
  _mailchimpSourceId = Number(result.insertId);
  return _mailchimpSourceId;
}

function mapMailchimpMemberToLead(member) {
  const merge = member.merge_fields || {};
  const name = [merge.FNAME, merge.LNAME].filter(Boolean).join(' ').trim() || member.email_address || 'Mailchimp Subscriber';
  return normalizeImportRow({
    name,
    email: member.email_address || '',
    mobile: merge.PHONE || '',
    'Mailchimp Member ID': member.id ?? '',
    Tags: (member.tags || []).map((t) => t.name).join(', '),
  });
}

// Mailchimp resolves which company a webhook belongs to via a random key baked
// into the URL (/webhook/mailchimp/:webhookKey) — Mailchimp itself never signs
// its webhook payloads (no HMAC header at all, by design), so possessing the
// correct URL *is* the authentication, same reasoning as HubSpot's key scheme.
async function resolveCompanyByMailchimpKey(webhookKey) {
  if (!webhookKey) return null;
  const rows = await q("SELECT company_id, `value` FROM company_settings WHERE `key`='mailchimp_webhook_key' AND `value`<>''");
  for (const row of rows) {
    if (decryptValue(row.value) === webhookKey) return Number(row.company_id);
  }
  return null;
}

export async function verifyAndActivateMailchimp(companyId) {
  const apiKey = await getSetting('mailchimp_api_key', '', companyId);
  if (!apiKey) throw new Error('Enter your Mailchimp API key first.');

  const root = await mailchimpFetch(companyId, '/');

  let webhookKey = await getSetting('mailchimp_webhook_key', '', companyId);
  if (!webhookKey) {
    webhookKey = crypto.randomBytes(16).toString('hex');
    await saveCompanySetting(companyId, 'mailchimp_webhook_key', webhookKey, 'sources');
  }

  let webhookStatus = 'skipped';
  try {
    const base = await getSetting('mailchimp_webhook_base_url', '', companyId);
    const listId = await getSetting('mailchimp_list_id', '', companyId);
    if (base && listId) {
      await mailchimpFetch(companyId, `/lists/${listId}/webhooks`, {
        method: 'POST',
        body: JSON.stringify({
          url: `${base.replace(/\/+$/, '')}/webhook/mailchimp/${webhookKey}`,
          events: { subscribe: true, unsubscribe: true, profile: true, cleaned: true, upemail: true, campaign: false },
          sources: { user: true, admin: true, api: true },
        }),
      });
      webhookStatus = 'registered';
    }
  } catch (err) {
    console.error('[mailchimp] webhook registration failed:', err.message);
    webhookStatus = 'failed';
  }

  const configJson = JSON.stringify({ name: root.account_name || 'Connected' });
  const existing = await one('SELECT id FROM integrations WHERE company_id=? AND slug=? LIMIT 1', [companyId, 'mailchimp']);
  if (existing) await run('UPDATE integrations SET is_active=1, config=?, updated_at=NOW() WHERE id=?', [configJson, existing.id]);
  else await run('INSERT INTO integrations (company_id,name,slug,type,is_active,config) VALUES (?,?,?,?,1,?)', [companyId, 'Mailchimp', 'mailchimp', 'marketing', configJson]);
  // Mirrors shopify_connected_shop/hubspot_connected: a company-scoped setting
  // the Integrations Settings UI reads directly, so the "Connected" badge
  // survives a page refresh instead of only living in local React state.
  await saveCompanySetting(companyId, 'mailchimp_connected_account', root.account_name || 'Connected', 'sources');

  return { account: root.account_name || '', webhookKey, webhookStatus };
}

export async function disconnectMailchimp(companyId) {
  await run("UPDATE integrations SET is_active=0, updated_at=NOW() WHERE company_id=? AND slug='mailchimp'", [companyId]);
  await saveCompanySetting(companyId, 'mailchimp_connected_account', '', 'sources');
}

export async function syncMailchimpLeads(companyId, req) {
  const members = await fetchAllSubscribedMembers(companyId);
  const sourceId = await ensureMailchimpSourceId();
  const summary = { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  for (const member of members) {
    summary.total += 1;
    const normalized = mapMailchimpMemberToLead(member);
    const result = await processLead(normalized, sourceId, null, req, undefined, { skipWelcomeTask: true });
    if (result.success) result.is_duplicate ? summary.duplicates += 1 : summary.imported += 1;
    else {
      summary.failed += 1;
      summary.errors.push(`Member ${member.id}: ${Object.values(result.errors).join(', ')}`);
    }
  }

  if (summary.imported > 0) {
    try {
      await run(
        `INSERT INTO tasks (company_id, title, description, priority, due_at) VALUES (?, ?, ?, 'high', NOW())`,
        [companyId, `Review ${summary.imported} leads from Mailchimp`, `Synced ${summary.imported} new subscriber(s) from your connected Mailchimp audience — review and reach out.`]
      );
    } catch (err) {
      console.error('[syncMailchimpLeads] summary task creation failed:', err);
    }
  }

  return summary;
}

// Mailchimp pings the webhook URL with a plain GET first to confirm it's
// reachable, then POSTs events as application/x-www-form-urlencoded (never
// JSON) — the global /webhook raw-body middleware only auto-parses JSON, so
// the form body is parsed here directly from the captured raw text instead.
export async function handleMailchimpWebhook(req, res) {
  const companyId = await resolveCompanyByMailchimpKey(req.params.webhookKey);
  if (!companyId) return res.status(404).send('unknown key');
  if (req.method === 'GET') return res.status(200).send('OK');

  const params = new URLSearchParams(req.rawBody || '');
  const type = params.get('type') || 'unknown';
  const email = params.get('data[email]') || '';
  const fname = params.get('data[merges][FNAME]') || '';
  const lname = params.get('data[merges][LNAME]') || '';
  const phone = params.get('data[merges][PHONE]') || '';

  const logResult = await run('INSERT INTO webhook_logs (source,event,payload,status,ip) VALUES (?,?,?,?,?)',
    ['mailchimp', type, req.rawBody || '', 'received', req.socket?.remoteAddress || '0.0.0.0']);

  // Mailchimp auto-disables a webhook after repeated non-200 responses, so this
  // always acknowledges 200 even on internal failure — matching the same
  // "log it, never let the sender see an error" rule the rest of this file's
  // webhook handlers already follow.
  try {
    let recorded = false;
    if ((type === 'subscribe' || type === 'profile') && email) {
      const name = [fname, lname].filter(Boolean).join(' ').trim() || email;
      const normalized = normalizeImportRow({ name, email, mobile: phone, 'Mailchimp Event': type });
      const sourceId = await ensureMailchimpSourceId();
      const fakeReq = { companyId, headers: req.headers, socket: req.socket };
      const result = await processLead(normalized, sourceId, null, fakeReq);
      recorded = result.success;
    }
    await run('UPDATE webhook_logs SET status=? WHERE id=?', [recorded ? 'processed' : 'ignored', logResult.insertId]);
    res.status(200).send('OK');
  } catch (err) {
    console.error('[mailchimp webhook] processing error:', err);
    await run('UPDATE webhook_logs SET status=?, error=? WHERE id=?', ['failed', String(err.stack || err.message || err).slice(0, 2000), logResult.insertId]).catch(() => {});
    res.status(200).send('OK');
  }
}
