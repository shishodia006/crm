import { one, q, run } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { hasRole, isAdmin } from '../utils/helpers.js';

export async function index(req, res) {
  const status = req.query.status || 'pending'; // pending | overdue | completed
  const scope  = req.query.scope  || 'mine';    // mine | all

  const isManagerUp = hasRole(req.user, 'admin', 'superadmin', 'manager');
  const userClause  = (scope === 'all' && isManagerUp)
    ? ''
    : 'AND (t.assigned_to = ? OR t.assigned_to IS NULL)';
  const userParams  = (scope === 'all' && isManagerUp) ? [] : [req.user.id];

  let statusClause;
  if (status === 'overdue')   statusClause = 't.done = 0 AND t.due_at IS NOT NULL AND t.due_at < NOW()';
  else if (status === 'completed') statusClause = 't.done = 1';
  else                        statusClause = 't.done = 0 AND (t.due_at IS NULL OR t.due_at >= NOW())';

  const tasks = await q(
    `SELECT t.*, l.name AS lead_name, u.name AS assigned_name
     FROM tasks t
     LEFT JOIN leads l ON l.id = t.lead_id
     LEFT JOIN users u ON u.id = t.assigned_to
     WHERE ${statusClause} ${userClause}
     ORDER BY t.due_at ASC, t.created_at DESC
     LIMIT 200`,
    userParams
  );

  // Counts for all tabs
  const countParams = (scope === 'all' && isManagerUp) ? [] : [req.user.id, req.user.id, req.user.id];
  const scopeFilter = (scope === 'all' && isManagerUp) ? '' : 'AND (t.assigned_to = ? OR t.assigned_to IS NULL)';

  const [[{ pending }], [{ overdue }], [{ completed }]] = await Promise.all([
    q(`SELECT COUNT(*) AS pending   FROM tasks t WHERE t.done=0 AND (t.due_at IS NULL OR t.due_at >= NOW()) ${scopeFilter}`, (scope === 'all' && isManagerUp) ? [] : [req.user.id]),
    q(`SELECT COUNT(*) AS overdue   FROM tasks t WHERE t.done=0 AND t.due_at IS NOT NULL AND t.due_at < NOW() ${scopeFilter}`, (scope === 'all' && isManagerUp) ? [] : [req.user.id]),
    q(`SELECT COUNT(*) AS completed FROM tasks t WHERE t.done=1 ${scopeFilter}`, (scope === 'all' && isManagerUp) ? [] : [req.user.id]),
  ]);

  ok(res, { tasks, counts: { pending: Number(pending), overdue: Number(overdue), completed: Number(completed) } });
}

export async function store(req, res) {
  const title = String(req.body.title || '').trim();
  if (!title) return fail(res, 'Task title required.', 422);
  const result = await run(
    'INSERT INTO tasks (lead_id, assigned_to, title, description, due_at, created_by) VALUES (?,?,?,?,?,?)',
    [
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
  const task = await one('SELECT assigned_to, created_by FROM tasks WHERE id=? LIMIT 1', [Number(req.params.id)]);
  if (!task) return fail(res, 'Task not found.', 404);
  if (!hasRole(req.user, 'admin', 'superadmin', 'manager') && task.assigned_to !== req.user.id && task.created_by !== req.user.id) {
    return fail(res, 'Forbidden.', 403);
  }
  await run('UPDATE tasks SET done=1, done_at=NOW() WHERE id=?', [Number(req.params.id)]);
  ok(res, null, 'Task marked done.');
}

export async function destroy(req, res) {
  const task = await one('SELECT * FROM tasks WHERE id=? LIMIT 1', [Number(req.params.id)]);
  if (!task) return fail(res, 'Task not found.', 404);
  if (!isAdmin(req.user) && task.assigned_to !== req.user.id && task.created_by !== req.user.id) {
    return fail(res, 'Forbidden.', 403);
  }
  await run('DELETE FROM tasks WHERE id=?', [Number(req.params.id)]);
  ok(res, null, 'Task deleted.');
}
