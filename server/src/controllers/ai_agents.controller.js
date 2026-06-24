import { one, q, run } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { runAgent } from '../services/ai.service.js';

export async function index(req, res) {
  const agents = await q(
    `SELECT a.*, u.name AS handoff_user_name, COUNT(k.id) AS knowledge_count
     FROM ai_agents a LEFT JOIN users u ON u.id=a.handoff_user_id
     LEFT JOIN ai_knowledge_items k ON k.agent_id=a.id AND k.is_active=1
     WHERE a.company_id=? GROUP BY a.id ORDER BY a.created_at DESC`, [req.companyId]
  );
  ok(res, { agents });
}

export async function store(req, res) {
  const name = String(req.body.name || '').trim();
  if (!name) return fail(res, 'Agent name is required.', 422);
  const result = await run(
    'INSERT INTO ai_agents (company_id,name,status,model,system_prompt,qualification_rules,handoff_user_id) VALUES (?,?,?,?,?,?,?)',
    [req.companyId, name, req.body.status || 'draft', req.body.model || null, req.body.system_prompt || null, JSON.stringify(req.body.qualification_rules || {}), req.body.handoff_user_id || null]
  );
  ok(res, { id: result.insertId }, 'AI agent created.');
}

export async function update(req, res) {
  const id = Number(req.params.id);
  const agent = await one('SELECT id FROM ai_agents WHERE id=? AND company_id=? LIMIT 1', [id, req.companyId]);
  if (!agent) return fail(res, 'AI agent not found.', 404);
  await run('UPDATE ai_agents SET name=?,status=?,model=?,system_prompt=?,qualification_rules=?,handoff_user_id=? WHERE id=? AND company_id=?', [
    req.body.name, req.body.status || 'draft', req.body.model || null, req.body.system_prompt || null, JSON.stringify(req.body.qualification_rules || {}), req.body.handoff_user_id || null, id, req.companyId
  ]);
  ok(res, null, 'AI agent updated.');
}

export async function knowledge(req, res) {
  const agent = await one('SELECT id FROM ai_agents WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  if (!agent) return fail(res, 'AI agent not found.', 404);
  const items = await q('SELECT * FROM ai_knowledge_items WHERE agent_id=? ORDER BY updated_at DESC', [agent.id]);
  ok(res, { items });
}

export async function saveKnowledge(req, res) {
  const agent = await one('SELECT id FROM ai_agents WHERE id=? AND company_id=? LIMIT 1', [Number(req.params.id), req.companyId]);
  if (!agent) return fail(res, 'AI agent not found.', 404);
  const title = String(req.body.title || '').trim(); const content = String(req.body.content || '').trim();
  if (!title || !content) return fail(res, 'Knowledge title and content are required.', 422);
  const result = await run('INSERT INTO ai_knowledge_items (agent_id,title,content) VALUES (?,?,?)', [agent.id, title, content]);
  ok(res, { id: result.insertId }, 'Knowledge item added.');
}

export async function preview(req, res) {
  const message = String(req.body.message || '').trim();
  if (!message) return fail(res, 'A test message is required.', 422);
  const result = await runAgent(Number(req.params.id), req.companyId, message);
  ok(res, result);
}
