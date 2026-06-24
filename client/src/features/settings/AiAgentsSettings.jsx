import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';

const BLANK = { name: '', status: 'draft', model: '', system_prompt: '', handoff_user_id: '' };

export default function AiAgentsSettings() {
  const toast = useToast();
  const { data, loading, reload } = useResource('/api/settings/ai-agents');
  const { data: usersData } = useResource('/api/settings/users');
  const [form, setForm] = useState(BLANK);
  const [knowledge, setKnowledge] = useState({ agentId: null, title: '', content: '' });
  const [saving, setSaving] = useState(false);
  const agents = data?.agents ?? []; const users = usersData?.users ?? [];
  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const save = async (event) => { event.preventDefault(); setSaving(true); try { await api.post('/api/settings/ai-agents', { ...form, handoff_user_id: form.handoff_user_id || null }); setForm(BLANK); reload(); toast('AI agent created.', 'success'); } catch (error) { toast(error.message, 'danger'); } finally { setSaving(false); } };
  const addKnowledge = async (event) => { event.preventDefault(); try { await api.post(`/api/settings/ai-agents/${knowledge.agentId}/knowledge`, { title: knowledge.title, content: knowledge.content }); setKnowledge({ agentId: null, title: '', content: '' }); reload(); toast('Knowledge item added.', 'success'); } catch (error) { toast(error.message, 'danger'); } };
  if (loading) return <LoadingBox />;
  return <div><div className="d-flex align-items-center mb-4"><div><h5 className="fw-bold mb-0 text-brand">AI Agents</h5><div className="text-muted text-12">Configure knowledge, qualification and human handoff before enabling a live AI provider.</div></div></div>
    <div className="card crm-card mb-4"><div className="card-body p-4"><form onSubmit={save}><div className="row g-3"><div className="col-md-4"><label className="crm-label">Agent name</label><input className="form-control crm-input" value={form.name} onChange={(e) => set('name', e.target.value)} required /></div><div className="col-md-2"><label className="crm-label">Status</label><select className="form-select crm-select" value={form.status} onChange={(e) => set('status', e.target.value)}>{['draft','active','paused'].map((status) => <option key={status}>{status}</option>)}</select></div><div className="col-md-3"><label className="crm-label">Handoff user</label><select className="form-select crm-select" value={form.handoff_user_id} onChange={(e) => set('handoff_user_id', e.target.value)}><option value="">— Select later —</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></div><div className="col-md-3"><label className="crm-label">Model label</label><input className="form-control crm-input" placeholder="e.g. gpt-4.1-mini" value={form.model} onChange={(e) => set('model', e.target.value)} /></div><div className="col-12"><label className="crm-label">System prompt / job</label><textarea className="form-control" rows="3" placeholder="Qualify the lead, answer FAQs, and hand off pricing requests…" value={form.system_prompt} onChange={(e) => set('system_prompt', e.target.value)} /></div><div className="col-12"><button className="btn btn-crm" disabled={saving}>{saving ? 'Saving…' : 'Create AI Agent'}</button></div></div></form></div></div>
    <div className="row g-3">{agents.map((agent) => <div className="col-lg-6" key={agent.id}><div className="card crm-card h-100"><div className="card-body p-4"><div className="d-flex mb-2"><strong className="me-auto">{agent.name}</strong><span className="badge text-bg-light border text-capitalize">{agent.status}</span></div><div className="text-muted text-12 mb-3">{agent.knowledge_count || 0} knowledge items · Handoff: {agent.handoff_user_name || 'Not set'}</div><button className="btn btn-outline-secondary btn-sm" onClick={() => setKnowledge({ agentId: agent.id, title: '', content: '' })}>Add knowledge</button>{knowledge.agentId === agent.id && <form className="mt-3" onSubmit={addKnowledge}><input className="form-control form-control-sm mb-2" placeholder="FAQ / topic title" value={knowledge.title} onChange={(e) => setKnowledge((current) => ({ ...current, title: e.target.value }))} required /><textarea className="form-control form-control-sm mb-2" rows="4" placeholder="Answer, policy, product details…" value={knowledge.content} onChange={(e) => setKnowledge((current) => ({ ...current, content: e.target.value }))} required /><button className="btn btn-sm btn-crm">Save knowledge</button></form>}</div></div></div>)}</div>
  </div>;
}
