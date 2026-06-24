import { scalar, q, run } from '../db/pool.js';

export async function getSetting(key, fallback = '', companyId = null) {
  if (companyId) {
    const companyValue = await scalar('SELECT `value` FROM company_settings WHERE company_id=? AND `key`=? LIMIT 1', [companyId, key]);
    if (companyValue != null && companyValue !== '') return String(companyValue);
  }
  const value = await scalar('SELECT `value` FROM settings WHERE `key`=? LIMIT 1', [key]);
  return value == null || value === '' ? fallback : String(value);
}

export async function companySettings(companyId, groups = []) {
  const globalRows = await q(groups.length
    ? `SELECT \`key\`,\`value\`,\`group\` FROM settings WHERE \`group\` IN (${groups.map(() => '?').join(',')})`
    : 'SELECT `key`,`value`,`group` FROM settings', groups);
  const localRows = await q(groups.length
    ? `SELECT \`key\`,\`value\`,\`group\` FROM company_settings WHERE company_id=? AND \`group\` IN (${groups.map(() => '?').join(',')})`
    : 'SELECT `key`,`value`,`group` FROM company_settings WHERE company_id=?', [companyId, ...groups]);
  const values = Object.fromEntries(globalRows.map((row) => [row.key, row.value]));
  for (const row of localRows) values[row.key] = row.value;
  return { values, rows: [...globalRows, ...localRows] };
}

export async function saveCompanySetting(companyId, key, value, group = 'general') {
  await run(
    'INSERT INTO company_settings (company_id,`key`,`value`,`group`) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`), `group`=VALUES(`group`)',
    [companyId, key, value ?? '', group]
  );
}

export async function saveSetting(key, value, group = 'general', conn = undefined) {
  const { run: _run } = await import('../db/pool.js');
  const exec = conn ? _run : run;
  await (conn
    ? conn.execute(
        'INSERT INTO settings (`key`,`value`,`group`) VALUES (?,?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`), `group`=VALUES(`group`)',
        [key, value ?? '', group]
      )
    : run(
        'INSERT INTO settings (`key`,`value`,`group`) VALUES (?,?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`), `group`=VALUES(`group`)',
        [key, value ?? '', group]
      ));
}
