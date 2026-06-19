import { one, q, run } from '../db/pool.js';
import { updateById } from '../db/pool.js';

export async function updateLeadScoreAndCategory(leadId, newScore, conn = undefined) {
  const category = newScore >= 151 ? 'sales_ready' : newScore >= 76 ? 'hot' : newScore >= 26 ? 'warm' : 'cold';
  await updateById('leads', leadId, { score: newScore, category }, conn);
}

export async function addScoreEvent(leadId, event, refType = null, refId = null, conn = undefined) {
  const { pool } = await import('../db/pool.js');
  const db = conn || pool;
  const lead = await one('SELECT id,score FROM leads WHERE id=? LIMIT 1', [leadId], db);
  if (!lead) return 0;
  const defaultRules = {
    email_open: 5, email_click: 10, wa_read: 10, wa_reply: 20,
    rcs_click: 10, sms_reply: 5, website_visit: 15, meeting_booked: 50,
    quotation_requested: 75, purchase_completed: 100
  };
  const rows = await q("SELECT `key`,`value` FROM settings WHERE `group`='scoring'", [], db);
  for (const row of rows) {
    const key = String(row.key).replace(/^score_/, '');
    if (Object.hasOwn(defaultRules, key)) defaultRules[key] = Number(row.value || 0);
  }
  const delta = defaultRules[event] || 0;
  const newScore = Math.max(0, Number(lead.score || 0) + delta);
  await updateLeadScoreAndCategory(leadId, newScore, db);
  await run(
    'INSERT INTO lead_score_events (lead_id,event,delta,score_after,ref_type,ref_id) VALUES (?,?,?,?,?,?)',
    [leadId, event, delta, newScore, refType, refId],
    db
  );
  if (newScore >= 76 && Number(lead.score || 0) < 76) {
    const seg = await one("SELECT id FROM segments WHERE name='Hot Leads' LIMIT 1", [], db);
    if (seg) await run('INSERT IGNORE INTO segment_leads (segment_id,lead_id) VALUES (?,?)', [seg.id, leadId], db);
  }
  return newScore;
}
