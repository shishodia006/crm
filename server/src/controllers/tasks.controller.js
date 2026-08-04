import { one, q, run } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';

export async function index(req, res) {
  const status = req.query.status || 'open'; // open | pending | overdue | completed
  const scope  = req.query.scope  || 'mine'; // mine | all

  // Per-company role, not the user's global role — the same person can be a
  // manager in one company and a plain agent in another (see leads/conversations
  // scoping, which uses the same req.companyRole check).
  const isManagerUp = ['admin', 'manager'].includes(req.companyRole);
  const useAllScope = scope === 'all' && isManagerUp;
  const userClause  = useAllScope ? '' : 'AND (t.assigned_to = ? OR t.assigned_to IS NULL)';
  const userParams  = useAllScope ? [] : [req.user.id];

  // A task due earlier today isn't "overdue" yet — it only becomes overdue once
  // its due date's calendar day has fully passed, matching the grace period the
  // Tasks page UI already applies (isOverdue() in TasksPage.jsx).
  let statusClause;
  if (status === 'overdue')        statusClause = "t.done = 0 AND t.due_at IS NOT NULL AND DATE(t.due_at) < CURDATE()";
  else if (status === 'completed') statusClause = 't.done = 1';
  else if (status === 'open')      statusClause = 't.done = 0';
  else                              statusClause = "t.done = 0 AND (t.due_at IS NULL OR DATE(t.due_at) >= CURDATE())";

  const tasks = await q(
    `SELECT t.*, l.name AS lead_name, d.title AS deal_title, d.value AS deal_value, u.name AS assigned_name
     FROM tasks t
     LEFT JOIN leads l ON l.id = t.lead_id
     LEFT JOIN deals d ON d.id = t.deal_id
     LEFT JOIN users u ON u.id = t.assigned_to
     WHERE t.company_id=? AND ${statusClause} ${userClause}
     ORDER BY t.due_at ASC, t.created_at DESC
     LIMIT 200`,
    [req.companyId, ...userParams]
  );

  // Counts for all 4 tabs: mine (open, assigned to me), overdue (mine subset),
  // team (open, company-wide), completed (company-wide, all time). An agent
  // can't actually see the "team"/"completed" scope (isManagerUp above), so
  // their badge counts shouldn't reveal the true company-wide numbers either.
  const mineFilter = 'AND (t.assigned_to = ? OR t.assigned_to IS NULL)';
  const teamFilter = isManagerUp ? '' : mineFilter;
  const teamParams = isManagerUp ? [req.companyId] : [req.companyId, req.user.id];
  const [[{ mine }], [{ overdue }], [{ team }], [{ completed }]] = await Promise.all([
    q(`SELECT COUNT(*) AS mine FROM tasks t WHERE t.company_id=? AND t.done=0 ${mineFilter}`, [req.companyId, req.user.id]),
    q(`SELECT COUNT(*) AS overdue FROM tasks t WHERE t.company_id=? AND t.done=0 AND t.due_at IS NOT NULL AND DATE(t.due_at) < CURDATE() ${mineFilter}`, [req.companyId, req.user.id]),
    q(`SELECT COUNT(*) AS team FROM tasks t WHERE t.company_id=? AND t.done=0 ${teamFilter}`, teamParams),
    q(`SELECT COUNT(*) AS completed FROM tasks t WHERE t.company_id=? AND t.done=1 ${teamFilter}`, teamParams),
  ]);

  ok(res, { tasks, counts: { mine: Number(mine), overdue: Number(overdue), team: Number(team), completed: Number(completed) } });
}

export async function store(req, res) {
  const title = String(req.body.title || '').trim();
  if (!title) return fail(res, 'Task title required.', 422);
  const result = await run(
    'INSERT INTO tasks (company_id,lead_id, assigned_to, title, description, due_at, created_by) VALUES (?,?,?,?,?,?,?)',
    [
      req.companyId,
      req.body.lead_id    ? Number(req.body.lead_id)    : null,
      req.body.assigned_to ? Number(req.body.assigned_to) : req.user.id,
      title,
      req.body.description || null,
      req.body.due_at || null,
      req.user.id,
    ]
  );
  ok(res, { id: result.insertId }, 'Task created.');
}

export async function markDone(req, res) {
  const task = await one('SELECT assigned_to, created_by FROM tasks WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  if (!task) return fail(res, 'Task not found.', 404);
  // Unassigned tasks (e.g. the auto-created "Welcome new lead"/import-summary
  // tasks) are shown to everyone in the list as up-for-grabs — anyone should be
  // able to complete one, not just an admin/manager, or this "Mark as done"
  // click 403s for the exact tasks a regular agent is meant to pick up.
  if (task.assigned_to !== null
    && !['admin', 'manager'].includes(req.companyRole) && task.assigned_to !== req.user.id && task.created_by !== req.user.id) {
    return fail(res, 'Forbidden.', 403);
  }
  await run('UPDATE tasks SET done=1, done_at=NOW() WHERE id=? AND company_id=?', [Number(req.params.id), req.companyId]);
  ok(res, null, 'Task marked done.');
}

export async function destroy(req, res) {
  const task = await one('SELECT * FROM tasks WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  if (!task) return fail(res, 'Task not found.', 404);
  if (req.companyRole !== 'admin' && task.assigned_to !== req.user.id && task.created_by !== req.user.id) {
    return fail(res, 'Forbidden.', 403);
  }
  await run('DELETE FROM tasks WHERE id=? AND company_id=?', [Number(req.params.id), req.companyId]);
  ok(res, null, 'Task deleted.');
}
