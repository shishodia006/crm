import { one, q } from '../db/pool.js';
import { getSetting } from './settings.service.js';

export async function runAgent(agentId, companyId, message) {
  const agent = await one('SELECT * FROM ai_agents WHERE id=? AND company_id=? AND status=\'active\' LIMIT 1', [agentId, companyId]);
  if (!agent) return { handled: false, reason: 'agent_not_active' };
  const knowledge = await q('SELECT title,content FROM ai_knowledge_items WHERE agent_id=? AND is_active=1 ORDER BY updated_at DESC LIMIT 12', [agent.id]);
  const apiUrl = await getSetting('ai_api_url', '', companyId);
  const apiKey = await getSetting('ai_api_key', '', companyId);
  if (!apiUrl || !apiKey) return { handled: false, reason: 'ai_provider_not_configured', handoff_user_id: agent.handoff_user_id };
  const context = knowledge.map((item) => `## ${item.title}\n${item.content}`).join('\n\n');
  const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: agent.model || undefined, messages: [{ role: 'system', content: `${agent.system_prompt || ''}\n\nKnowledge:\n${context}` }, { role: 'user', content: message }] }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || 'AI provider request failed');
  const reply = payload?.choices?.[0]?.message?.content || payload?.output_text || '';
  return { handled: Boolean(reply), reply, handoff_user_id: agent.handoff_user_id };
}
