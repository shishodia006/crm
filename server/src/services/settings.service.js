import { scalar, q, run } from '../db/pool.js';
import { encryptValue, decryptValue } from '../utils/crypto.js';

// Matches setting keys that hold a live credential (passwords, API keys/secrets/tokens)
// so they're encrypted at rest rather than stored as plaintext.
const SENSITIVE_KEY_PATTERN = /(_pass|_pwd|_key|_secret|_token)$/i;
const isSensitive = (key) => SENSITIVE_KEY_PATTERN.test(key);

export async function getSetting(key, fallback = '', companyId = null) {
  if (companyId) {
    const companyValue = await scalar('SELECT `value` FROM company_settings WHERE company_id=? AND `key`=? LIMIT 1', [companyId, key]);
    if (companyValue != null && companyValue !== '') return isSensitive(key) ? decryptValue(String(companyValue)) : String(companyValue);
  }
  const value = await scalar('SELECT `value` FROM settings WHERE `key`=? LIMIT 1', [key]);
  if (value == null || value === '') return fallback;
  return isSensitive(key) ? decryptValue(String(value)) : String(value);
}

export async function companySettings(companyId, groups = []) {
  const globalRows = await q(groups.length
    ? `SELECT \`key\`,\`value\`,\`group\` FROM settings WHERE \`group\` IN (${groups.map(() => '?').join(',')})`
    : 'SELECT `key`,`value`,`group` FROM settings', groups);
  const localRows = await q(groups.length
    ? `SELECT \`key\`,\`value\`,\`group\` FROM company_settings WHERE company_id=? AND \`group\` IN (${groups.map(() => '?').join(',')})`
    : 'SELECT `key`,`value`,`group` FROM company_settings WHERE company_id=?', [companyId, ...groups]);
  const decryptRow = (row) => (isSensitive(row.key) ? { ...row, value: decryptValue(row.value) } : row);
  const decryptedGlobal = globalRows.map(decryptRow);
  const decryptedLocal = localRows.map(decryptRow);
  const values = Object.fromEntries(decryptedGlobal.map((row) => [row.key, row.value]));
  for (const row of decryptedLocal) values[row.key] = row.value;
  return { values, rows: [...decryptedGlobal, ...decryptedLocal] };
}

export async function saveCompanySetting(companyId, key, value, group = 'general') {
  const stored = isSensitive(key) && value ? encryptValue(value) : (value ?? '');
  await run(
    'INSERT INTO company_settings (company_id,`key`,`value`,`group`) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`), `group`=VALUES(`group`)',
    [companyId, key, stored, group]
  );
}

export async function saveSetting(key, value, group = 'general', conn = undefined) {
  const { run: _run } = await import('../db/pool.js');
  const exec = conn ? _run : run;
  const stored = isSensitive(key) && value ? encryptValue(value) : (value ?? '');
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
