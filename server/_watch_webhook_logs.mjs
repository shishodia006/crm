import { q } from './src/db/pool.js';

let lastId = Number(process.argv[2] || 0);

async function poll() {
  const rows = await q(
    'SELECT id,source,payload,status,error,ip,created_at FROM webhook_logs WHERE id > ? ORDER BY id ASC',
    [lastId]
  );
  for (const r of rows) {
    lastId = r.id;
    console.log(`--- webhook_logs #${r.id} | source=${r.source} | status=${r.status} | ip=${r.ip} | ${r.created_at} ---`);
    console.log(`payload: ${r.payload}`);
    if (r.error) console.log(`error: ${r.error}`);
  }
}

setInterval(() => { poll().catch((e) => console.log('poll error:', e.message)); }, 1500);
