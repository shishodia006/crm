import crypto from 'crypto';
import { scalar, q, run } from '../db/pool.js';
import { encryptValue, decryptValue } from '../utils/crypto.js';

// Matches setting keys that hold a live credential (passwords, API keys/secrets/tokens)
// so they're encrypted at rest rather than stored as plaintext.
const SENSITIVE_KEY_PATTERN = /(_pass|_pwd|_key|_secret|_token)$/i;
export const isSensitive = (key) => SENSITIVE_KEY_PATTERN.test(key);

export async function getSetting(key, fallback = '', companyId = null) {
  if (companyId) {
    const companyValue = await scalar('SELECT `value` FROM company_settings WHERE company_id=? AND `key`=? LIMIT 1', [companyId, key]);
    if (companyValue != null && companyValue !== '') return isSensitive(key) ? decryptValue(String(companyValue)) : String(companyValue);
    // Credentials are strictly per-company — never fall back to another
    // company's (or a pre-multi-tenancy install's) global secret. A company
    // that hasn't configured its own key/password/token yet has none, full stop.
    if (isSensitive(key)) return fallback;
  }
  const value = await scalar('SELECT `value` FROM settings WHERE `key`=? LIMIT 1', [key]);
  if (value == null || value === '') return fallback;
  return isSensitive(key) ? decryptValue(String(value)) : String(value);
}

// The generic Anantya webhook route (no per-account key in the URL, used by a
// company's *default* WhatsApp number) has no other way to authenticate the
// caller or know which company a message belongs to. Anantya lets you attach a
// custom header echoing back the API key we already gave them — matching it
// against each company's stored (encrypted) key both verifies the call is
// genuinely from Anantya and resolves which company it belongs to.
export async function resolveCompanyByAnantyaKey(providedKey) {
  if (!providedKey) return null;
  const rows = await q("SELECT company_id, `value` FROM company_settings WHERE `key`='wa_anantya_api_key' AND `value`<>''");
  for (const row of rows) {
    if (decryptValue(row.value) === providedKey) return Number(row.company_id);
  }
  return null;
}

// Shopify webhooks (customers/create, orders/create, etc.) identify the sending
// store via the X-Shopify-Shop-Domain header — unlike Anantya's API-key header,
// the domain isn't sensitive/encrypted, so a direct value match is enough.
export async function resolveCompanyByShopDomain(shopDomain) {
  if (!shopDomain) return null;
  const companyId = await scalar("SELECT company_id FROM company_settings WHERE `key`='shopify_shop_domain' AND `value`=? LIMIT 1", [shopDomain]);
  return companyId ? Number(companyId) : null;
}

// Twilio's "A call comes in" webhook (shared by every company's purchased
// number, configured once in the Twilio console) carries no company-identifying
// header — the dialed number itself (E.164, in the request's `To` field) is the
// only signal. Mirrors resolveCompanyByShopDomain(), not the encrypted-loop
// resolveCompanyByAnantyaKey() — twilio_phone_number is stored unencrypted
// (doesn't match isSensitive()'s _pass/_pwd/_key/_secret/_token suffix pattern),
// so a direct SQL match is enough.
export async function resolveCompanyByTwilioNumber(toNumber) {
  if (!toNumber) return null;
  const companyId = await scalar("SELECT company_id FROM company_settings WHERE `key`='twilio_phone_number' AND `value`=? LIMIT 1", [toNumber]);
  return companyId ? Number(companyId) : null;
}

// Several webhook-receiving integrations (HubSpot, Mailchimp, Zendesk, and now
// IndiaMart/Meta/Google Ads below) resolve which company a callback belongs to
// via a random key embedded in the webhook URL itself, since the sender either
// doesn't sign requests at all or doesn't include a company-identifying header.
// This centralizes the generate-once / decrypt-and-match pattern so each new
// integration doesn't reimplement it.
export async function ensureWebhookKey(companyId, settingKey) {
  let key = await getSetting(settingKey, '', companyId);
  if (!key) {
    key = crypto.randomBytes(16).toString('hex');
    await saveCompanySetting(companyId, settingKey, key, 'sources');
  }
  return key;
}

export async function resolveCompanyByWebhookKey(settingKey, providedKey) {
  if (!providedKey) return null;
  const rows = await q('SELECT company_id, `value` FROM company_settings WHERE `key`=? AND `value`<>\'\'', [settingKey]);
  for (const row of rows) {
    if (decryptValue(row.value) === providedKey) return Number(row.company_id);
  }
  return null;
}

export async function companySettings(companyId, groups = []) {
  const globalRows = await q(groups.length
    ? `SELECT \`key\`,\`value\`,\`group\` FROM settings WHERE \`group\` IN (${groups.map(() => '?').join(',')})`
    : 'SELECT `key`,`value`,`group` FROM settings', groups);
  const localRows = await q(groups.length
    ? `SELECT \`key\`,\`value\`,\`group\` FROM company_settings WHERE company_id=? AND \`group\` IN (${groups.map(() => '?').join(',')})`
    : 'SELECT `key`,`value`,`group` FROM company_settings WHERE company_id=?', [companyId, ...groups]);
  const decryptRow = (row) => (isSensitive(row.key) ? { ...row, value: decryptValue(row.value) } : row);
  // Credentials never come from the shared/global row set — only that company's
  // own company_settings. Global rows only ever seed non-sensitive defaults
  // (e.g. a default SMS gateway URL template), same as getSetting() above.
  const decryptedGlobal = globalRows.filter((row) => !isSensitive(row.key)).map(decryptRow);
  const decryptedLocal = localRows.map(decryptRow);
  const values = Object.fromEntries(decryptedGlobal.map((row) => [row.key, row.value]));
  for (const row of decryptedLocal) values[row.key] = row.value;
  return { values, rows: [...decryptedGlobal, ...decryptedLocal] };
}

export async function saveCompanySetting(companyId, key, value, group = 'general') {
  // Copy-pasted API keys/tokens very commonly carry an invisible leading/trailing
  // space or newline (from Slack, WhatsApp, email, etc.) — sent to the provider
  // as-is this breaks auth in a way that's nearly impossible to spot by eye, so
  // trim before it's ever encrypted/stored.
  const cleaned = typeof value === 'string' ? value.trim() : value;
  const stored = isSensitive(key) && cleaned ? encryptValue(cleaned) : (cleaned ?? '');
  await run(
    'INSERT INTO company_settings (company_id,`key`,`value`,`group`) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`), `group`=VALUES(`group`)',
    [companyId, key, stored, group]
  );
}

export async function saveSetting(key, value, group = 'general', conn = undefined) {
  const { run: _run } = await import('../db/pool.js');
  const exec = conn ? _run : run;
  const cleaned = typeof value === 'string' ? value.trim() : value;
  const stored = isSensitive(key) && cleaned ? encryptValue(cleaned) : (cleaned ?? '');
  await (conn
    ? conn.execute(
        'INSERT INTO settings (`key`,`value`,`group`) VALUES (?,?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`), `group`=VALUES(`group`)',
        [key, stored, group]
      )
    : run(
        'INSERT INTO settings (`key`,`value`,`group`) VALUES (?,?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`), `group`=VALUES(`group`)',
        [key, stored, group]
      ));
}
