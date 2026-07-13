import { q, run } from '../db/pool.js';

export function matchesConditions(lead, conditions) {
  const entries = Object.entries(conditions || {});
  if (!entries.length) return false;
  for (const [field, rule] of entries) {
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
    if (!pass) return false;
  }
  return true;
}

export async function backfillSegment(segmentId, companyId, conditions) {
  const leads = await q('SELECT * FROM leads WHERE company_id=?', [companyId]);
  let added = 0;
  for (const lead of leads) {
    if (matchesConditions(lead, conditions)) {
      const result = await run('INSERT IGNORE INTO segment_leads (segment_id,lead_id) VALUES (?,?)', [segmentId, lead.id]);
      if (result.affectedRows > 0) added += 1;
    }
  }
  return added;
}
