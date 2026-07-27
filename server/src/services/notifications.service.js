import { q, run } from '../db/pool.js';

// Inserts one row per target user so each person's notification bell/read-state
// is independent (the table is per-user, not per-company — see schema.sql).
export async function notifyUsers(userIds, { type, title, body = null, link = null }) {
  const ids = [...new Set(userIds.filter(Boolean).map(Number))];
  if (!ids.length) return;
  const values = ids.map(() => '(?,?,?,?,?)').join(',');
  const params = ids.flatMap((id) => [id, type, title, body, link]);
  await run(`INSERT INTO notifications (user_id, type, title, body, link) VALUES ${values}`, params);
}

// Who should hear about something on this lead: the assigned agent if there is
// one, otherwise every active user in the company (small-team default — nobody
// misses a new prospect just because it hasn't been assigned yet).
export async function notifyRecipientsForLead(companyId, assignedTo) {
  if (assignedTo) return [Number(assignedTo)];
  const rows = await q(
    `SELECT u.id FROM users u JOIN company_users cu ON cu.user_id=u.id
     WHERE cu.company_id=? AND u.is_active=1`,
    [companyId]
  );
  return rows.map((r) => Number(r.id));
}
