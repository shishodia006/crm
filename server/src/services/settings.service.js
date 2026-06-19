import { scalar, run } from '../db/pool.js';

export async function getSetting(key, fallback = '') {
  const value = await scalar('SELECT `value` FROM settings WHERE `key`=? LIMIT 1', [key]);
  return value == null || value === '' ? fallback : String(value);
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
