import mysql from 'mysql2/promise';
import { config } from '../config/index.js';

export const pool = mysql.createPool({
  ...config.db,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL_SIZE || 10),
  timezone: 'local',
  namedPlaceholders: false,
  multipleStatements: false
});

export async function q(sql, params = [], conn = pool) {
  const [rows] = await conn.execute(sql, params);
  return rows;
}

export async function one(sql, params = [], conn = pool) {
  const rows = await q(sql, params, conn);
  return rows[0] || null;
}

export async function scalar(sql, params = [], conn = pool) {
  const row = await one(sql, params, conn);
  return row ? Object.values(row)[0] : null;
}

export async function run(sql, params = [], conn = pool) {
  const [result] = await conn.execute(sql, params);
  return result;
}

export async function transaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function updateById(table, id, data, conn = pool) {
  const keys = Object.keys(data).filter((key) => data[key] !== undefined);
  if (!keys.length) return false;
  const set = keys.map((key) => `\`${key}\`=?`).join(',');
  await run(`UPDATE \`${table}\` SET ${set} WHERE id=?`, [...keys.map((key) => data[key]), id], conn);
  return true;
}
