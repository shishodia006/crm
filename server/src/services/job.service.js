import { q, run } from '../db/pool.js';

export async function enqueueJob(type, data, conn = undefined) {
  const { pool } = await import('../db/pool.js');
  const db = conn || pool;
  await run('INSERT INTO jobs (queue,payload) VALUES (?,?)', ['default', JSON.stringify({ type, data })], db);
}

export async function processJobs(limit = 50) {
  const { enrollLead } = await import('./drip.service.js');
  const stats = { processed: 0, retried: 0, failed: 0 };
  const jobs = await q(
    `SELECT * FROM jobs WHERE status='pending' AND available_at <= NOW()
     ORDER BY available_at ASC LIMIT ${Math.max(1, Math.min(Number(limit), 500))}`
  );
  for (const job of jobs) {
    const attempts = Number(job.attempts || 0) + 1;
    try {
      const claimed = await run(
        "UPDATE jobs SET status='processing', attempts=?, reserved_at=NOW(), error=NULL WHERE id=? AND status='pending'",
        [attempts, job.id]
      );
      if (claimed.affectedRows !== 1) continue;
      const payload = JSON.parse(job.payload || '{}');
      const type = payload.type || '';
      const data = payload.data || payload;
      if (type === 'segment_lead') await segmentLead(Number(data.lead_id));
      else if (type === 'enroll_lead') await enrollLead(Number(data.lead_id), Number(data.campaign_id));
      else if (type === 'enroll_segment') {
        for (const leadId of data.lead_ids || []) await enrollLead(Number(leadId), Number(data.campaign_id));
      } else if (type !== 'send_campaign_blast') {
        throw new Error(`Unsupported job type: ${type}`);
      }
      await run("UPDATE jobs SET status='done', reserved_at=NULL WHERE id=?", [job.id]);
      stats.processed += 1;
    } catch (error) {
      const max = Math.max(1, Number(job.max_attempts || 3));
      if (attempts < max) {
        await run(
          "UPDATE jobs SET status='pending', reserved_at=NULL, available_at=DATE_ADD(NOW(), INTERVAL 5 MINUTE), error=? WHERE id=?",
          [String(error.message).slice(0, 2000), job.id]
        );
        stats.retried += 1;
      } else {
        await run("UPDATE jobs SET status='failed', reserved_at=NULL, failed_at=NOW(), error=? WHERE id=?", [
          String(error.message).slice(0, 2000), job.id
        ]);
        stats.failed += 1;
      }
    }
  }
  return stats;
}

export async function segmentLead(leadId) {
  const { one } = await import('../db/pool.js');
  const lead = await one('SELECT * FROM leads WHERE id=? LIMIT 1', [leadId]);
  if (!lead) return;
  const segments = await q("SELECT id,conditions FROM segments WHERE type='dynamic'");
  for (const segment of segments) {
    let conditions = {};
    try { conditions = JSON.parse(segment.conditions || '{}'); } catch { conditions = {}; }
    let matches = Object.keys(conditions).length > 0;
    for (const [field, rule] of Object.entries(conditions)) {
      const value = lead[field];
      const op = rule.op || 'eq';
      const expected = rule.value;
      const pass =
        op === 'eq' ? value == expected :
        op === 'neq' ? value != expected :
        op === 'contains' ? String(value || '').toLowerCase().includes(String(expected || '').toLowerCase()) :
        op === 'gte' ? Number(value || 0) >= Number(expected || 0) :
        op === 'lte' ? Number(value || 0) <= Number(expected || 0) :
        op === 'in' ? [].concat(expected).includes(value) :
        false;
      if (!pass) matches = false;
    }
    if (matches) await run('INSERT IGNORE INTO segment_leads (segment_id,lead_id) VALUES (?,?)', [segment.id, leadId]);
  }
}
