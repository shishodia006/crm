import { one, q, run } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { askAnalyst } from '../services/analyst.service.js';

export async function listSessions(req, res) {
  const sessions = await q(
    `SELECT s.*, (SELECT content FROM analyst_messages WHERE session_id=s.id ORDER BY created_at ASC LIMIT 1) AS first_message
     FROM analyst_sessions s WHERE s.company_id=? AND s.user_id=? ORDER BY s.updated_at DESC LIMIT 50`,
    [req.companyId, req.user.id]
  );
  ok(res, { sessions });
}

export async function createSession(req, res) {
  const result = await run('INSERT INTO analyst_sessions (company_id,user_id,title) VALUES (?,?,?)', [req.companyId, req.user.id, null]);
  ok(res, { id: result.insertId }, 'Session created.');
}

async function loadSession(sessionId, companyId, userId) {
  return one('SELECT * FROM analyst_sessions WHERE id=? AND company_id=? AND user_id=? LIMIT 1', [sessionId, companyId, userId]);
}

export async function listMessages(req, res) {
  const session = await loadSession(Number(req.params.id), req.companyId, req.user.id);
  if (!session) return fail(res, 'Session not found.', 404);
  const messages = await q('SELECT id,role,content,created_at FROM analyst_messages WHERE session_id=? ORDER BY created_at ASC', [session.id]);
  ok(res, { session, messages });
}

export async function postMessage(req, res) {
  const question = String(req.body.message || '').trim();
  if (!question) return fail(res, 'A message is required.', 422);
  const session = await loadSession(Number(req.params.id), req.companyId, req.user.id);
  if (!session) return fail(res, 'Session not found.', 404);

  const prior = await q(
    'SELECT role,content FROM analyst_messages WHERE session_id=? ORDER BY created_at DESC LIMIT 10',
    [session.id]
  );
  prior.reverse();

  await run("INSERT INTO analyst_messages (session_id,role,content) VALUES (?,'user',?)", [session.id, question]);
  if (!session.title) {
    await run('UPDATE analyst_sessions SET title=? WHERE id=?', [question.slice(0, 120), session.id]);
  }

  let reply;
  try {
    reply = await askAnalyst(req.companyId, prior, question);
  } catch (error) {
    if (error.code === 'ai_provider_not_configured') {
      reply = 'My Analyst isn\'t connected to an AI provider yet. Ask an admin to add the AI Provider URL and API Key under Settings → General, then try again.';
    } else {
      console.error('[analyst] askAnalyst failed:', error.message);
      reply = 'Something went wrong reaching the AI provider. Please try again in a moment.';
    }
  }

  const result = await run("INSERT INTO analyst_messages (session_id,role,content) VALUES (?,'assistant',?)", [session.id, reply]);
  await run('UPDATE analyst_sessions SET updated_at=NOW() WHERE id=?', [session.id]);
  ok(res, { id: result.insertId, role: 'assistant', content: reply, created_at: new Date() });
}

export async function destroySession(req, res) {
  const session = await loadSession(Number(req.params.id), req.companyId, req.user.id);
  if (!session) return fail(res, 'Session not found.', 404);
  await run('DELETE FROM analyst_sessions WHERE id=?', [session.id]);
  ok(res, null, 'Session deleted.');
}
