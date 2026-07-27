import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';

const STEP_META = {
  multi_send:    { label: 'Multi-Channel Send', icon: 'broadcast',     color: '#0ea5e9' },
  email:         { label: 'Send Email',         icon: 'envelope',      color: '#3b82f6' },
  whatsapp:      { label: 'Send WhatsApp',      icon: 'whatsapp',      color: '#25d366' },
  rcs:           { label: 'Send RCS',            icon: 'phone-vibrate', color: '#8b5cf6' },
  sms:           { label: 'Send SMS',            icon: 'chat-dots',     color: '#f59e0b' },
  wait:          { label: 'Wait / Delay',        icon: 'clock',         color: '#6b7280' },
  assign_agent:  { label: 'Assign Agent',        icon: 'person-check', color: '#7c3aed' },
  task:          { label: 'Create Task',         icon: 'check2-square', color: '#0891b2' },
  move_pipeline: { label: 'Move Pipeline Stage', icon: 'kanban',        color: '#db2777' },
  tag_lead:      { label: 'Add Tag',              icon: 'tag',          color: '#ea580c' },
  exit:          { label: 'Exit Sequence',       icon: 'x-circle',      color: '#dc2626' },
};
const ADDABLE_TYPES = Object.keys(STEP_META);
const SEND_TYPES = ['email', 'whatsapp', 'rcs', 'sms'];

function parseActionData(raw) {
  try { return typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); } catch { return {}; }
}

function isLinear(steps) {
  if (steps.some((s) => s.type === 'condition')) return false;
  if (steps.some((s) => s.yes_next_id || s.no_next_id)) return false;
  const parentCounts = {};
  for (const s of steps) {
    if (s.parent_id) parentCounts[s.parent_id] = (parentCounts[s.parent_id] || 0) + 1;
  }
  return Object.values(parentCounts).every((c) => c <= 1);
}

function orderSteps(steps) {
  if (!steps.length) return [];
  const byParent = new Map();
  for (const s of steps) if (s.parent_id) byParent.set(s.parent_id, s);
  let root = steps.find((s) => !s.parent_id);
  if (!root) root = steps[0];
  const ordered = [root];
  const seen = new Set([root.id]);
  let current = root;
  while (true) {
    const next = steps.find((s) => s.parent_id === current.id);
    if (!next || seen.has(next.id)) break;
    ordered.push(next);
    seen.add(next.id);
    current = next;
  }
  return ordered;
}

function stepTitle(step, templates) {
  const meta = STEP_META[step.type] || { label: step.type };
  if (SEND_TYPES.includes(step.type)) {
    const t = templates.find((x) => Number(x.id) === Number(step.template_id));
    return `${meta.label}${t ? `: "${t.name}"` : ''}`;
  }
  return meta.label;
}

function stepDescription(step, ad, ctx) {
  if (step.type === 'wait') {
    return `Pauses for ${step.delay_value || 0} ${step.delay_unit || 'days'} before continuing.`;
  }
  if (SEND_TYPES.includes(step.type)) {
    return Number(step.delay_value || 0) === 0 ? 'Sent immediately' : `Sent ${step.delay_value} ${step.delay_unit} after the previous step`;
  }
  if (step.type === 'multi_send') {
    const chosen = ['email', 'whatsapp', 'rcs', 'sms'].filter((ch) => ad[`${ch}_template_id`]);
    return chosen.length ? `Sends ${chosen.join(' + ')} at once` : 'No channels selected yet';
  }
  if (step.type === 'assign_agent') {
    const agent = ctx.agents.find((a) => Number(a.id) === Number(ad.agent_id));
    return agent ? `Assigns to ${agent.name}` : 'Auto-assigns via round robin';
  }
  if (step.type === 'task') return ad.task_title ? `"${ad.task_title}"` : 'Creates a follow-up task';
  if (step.type === 'move_pipeline') {
    const stage = ctx.stages.find((s) => Number(s.id) === Number(ad.pipeline_stage));
    return stage ? `Moves the deal to "${stage.name}"` : 'No stage selected yet';
  }
  if (step.type === 'tag_lead') return ad.tag_name ? `Tags the lead "${ad.tag_name}"` : 'No tag set yet';
  if (step.type === 'exit') return 'The lead exits the workflow — no more steps run.';
  return '';
}

function StepEditor({ step, ad, templates, agents, stages, onChange }) {
  const set = (patch) => onChange(patch);
  const setAd = (patch) => onChange({ action_data: { ...ad, ...patch } });

  if (SEND_TYPES.includes(step.type)) {
    const options = templates.filter((t) => t.channel === step.type);
    return (
      <div className="row g-2 mt-2">
        <div className="col-md-6">
          <label className="crm-label">Template</label>
          <select className="crm-select w-100" value={step.template_id || ''} onChange={(e) => set({ template_id: e.target.value })}>
            <option value="">— Select —</option>
            {options.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="col-md-3">
          <label className="crm-label">Delay</label>
          <input type="number" min={0} className="crm-input" value={step.delay_value ?? 0} onChange={(e) => set({ delay_value: e.target.value })} />
        </div>
        <div className="col-md-3">
          <label className="crm-label">Unit</label>
          <select className="crm-select w-100" value={step.delay_unit || 'days'} onChange={(e) => set({ delay_unit: e.target.value })}>
            <option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option>
          </select>
        </div>
      </div>
    );
  }
  if (step.type === 'wait') {
    return (
      <div className="row g-2 mt-2">
        <div className="col-md-6">
          <label className="crm-label">Wait for</label>
          <input type="number" min={0} className="crm-input" value={step.delay_value ?? 0} onChange={(e) => set({ delay_value: e.target.value })} />
        </div>
        <div className="col-md-6">
          <label className="crm-label">Unit</label>
          <select className="crm-select w-100" value={step.delay_unit || 'days'} onChange={(e) => set({ delay_unit: e.target.value })}>
            <option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option>
          </select>
        </div>
      </div>
    );
  }
  if (step.type === 'multi_send') {
    return (
      <div className="row g-2 mt-2">
        {SEND_TYPES.map((ch) => (
          <div className="col-md-6" key={ch}>
            <label className="crm-label text-capitalize">{ch}</label>
            <select className="crm-select w-100" value={ad[`${ch}_template_id`] || ''} onChange={(e) => setAd({ [`${ch}_template_id`]: e.target.value })}>
              <option value="">— None —</option>
              {templates.filter((t) => t.channel === ch).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        ))}
      </div>
    );
  }
  if (step.type === 'assign_agent') {
    return (
      <div className="mt-2">
        <label className="crm-label">Agent</label>
        <select className="crm-select w-100" value={ad.agent_id || ''} onChange={(e) => setAd({ agent_id: e.target.value })}>
          <option value="">— Auto-assign (round robin) —</option>
          {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
    );
  }
  if (step.type === 'task') {
    return (
      <div className="row g-2 mt-2">
        <div className="col-md-8">
          <label className="crm-label">Task title</label>
          <input className="crm-input" value={ad.task_title || ''} onChange={(e) => setAd({ task_title: e.target.value })} />
        </div>
        <div className="col-md-4">
          <label className="crm-label">Due in (hours)</label>
          <input type="number" min={1} className="crm-input" value={ad.due_hours || 24} onChange={(e) => setAd({ due_hours: e.target.value })} />
        </div>
      </div>
    );
  }
  if (step.type === 'move_pipeline') {
    return (
      <div className="mt-2">
        <label className="crm-label">Pipeline stage</label>
        <select className="crm-select w-100" value={ad.pipeline_stage || ''} onChange={(e) => setAd({ pipeline_stage: e.target.value })}>
          <option value="">— Select stage —</option>
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
    );
  }
  if (step.type === 'tag_lead') {
    return (
      <div className="mt-2">
        <label className="crm-label">Tag name</label>
        <input className="crm-input" value={ad.tag_name || ''} onChange={(e) => setAd({ tag_name: e.target.value })} />
      </div>
    );
  }
  return null;
}

function AddStepPicker({ onPick, onCancel }) {
  return (
    <div className="card crm-card mt-2">
      <div className="card-body p-3">
        <div className="row g-2">
          {ADDABLE_TYPES.map((type) => {
            const meta = STEP_META[type];
            return (
              <div className="col-6 col-md-4" key={type}>
                <button type="button" className="btn btn-outline-secondary w-100 text-start d-flex align-items-center gap-2" onClick={() => onPick(type)}>
                  <span className="crm-step-icon" style={{ background: `${meta.color}1a`, color: meta.color }}><i className={`bi bi-${meta.icon}`} /></span>
                  <span className="text-13">{meta.label}</span>
                </button>
              </div>
            );
          })}
        </div>
        <button type="button" className="btn btn-link text-muted text-12 mt-2 p-0" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function SimpleBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [campaign, setCampaign] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [agents, setAgents] = useState([]);
  const [stages, setStages] = useState([]);
  const [steps, setSteps] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [addingStep, setAddingStep] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    api.get(`/api/campaigns/${id}/builder`).then((d) => {
      setCampaign(d.campaign);
      setTemplates(d.templates ?? []);
      setAgents(d.agents ?? []);
      setStages(d.stages ?? []);
      const ordered = orderSteps(d.workflowSteps ?? []);
      setSteps(ordered.map((s, i) => ({
        uid: `existing-${s.id}`,
        type: s.type,
        template_id: s.template_id,
        delay_value: s.delay_value,
        delay_unit: s.delay_unit,
        action_data: parseActionData(s.action_data),
      })));
      setLoading(false);
    }).catch((err) => { setLoadError(err.message || 'Failed to load this sequence.'); setLoading(false); });
  }, [id]);

  const linear = useMemo(() => isLinear(steps.map((s) => ({ type: s.type }))), [steps]);
  const entryRules = useMemo(() => {
    try { return typeof campaign?.entry_rules === 'string' ? JSON.parse(campaign.entry_rules || '{}') : (campaign?.entry_rules || {}); } catch { return {}; }
  }, [campaign]);

  if (loading) return <LoadingBox />;
  if (loadError) return <div className="alert alert-danger">{loadError}</div>;
  if (!campaign) return <p className="text-muted">Sequence not found.</p>;

  const updateStep = (uid, patch) => setSteps((prev) => prev.map((s) => (s.uid === uid ? { ...s, ...patch } : s)));
  const removeStep = (uid) => setSteps((prev) => prev.filter((s) => s.uid !== uid));
  const addStep = (type) => {
    setSteps((prev) => [...prev, { uid: `new-${Date.now()}`, type, template_id: '', delay_value: type === 'wait' ? 1 : 0, delay_unit: 'days', action_data: {} }]);
    setAddingStep(false);
  };

  const handleDrop = (index) => {
    if (dragIndex === null || dragIndex === index) return;
    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = steps.map((s, i) => ({
        id: `s${i}`,
        step_order: i,
        type: s.type,
        template_id: s.template_id || null,
        delay_value: Number(s.delay_value || 0),
        delay_unit: s.delay_unit || 'days',
        agent_id: s.action_data?.agent_id || null,
        pipeline_stage: s.action_data?.pipeline_stage || null,
        task_title: s.action_data?.task_title || null,
        tag_name: s.action_data?.tag_name || null,
        action_data: s.action_data || {},
        x: 250, y: i * 150,
      }));
      const connections = payload.slice(0, -1).map((s, i) => ({ from: s.id, to: payload[i + 1].id }));
      await api.post(`/api/campaigns/${id}/steps`, { steps: payload, connections });
      toast('Sequence saved.', 'success');
    } catch (err) { toast(err.message, 'danger'); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-1">
        <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate('/campaigns')}><i className="bi bi-arrow-left" /></button>
        <div className="me-auto">
          <h5 className="fw-bold mb-0 text-brand">{campaign.name} — Builder</h5>
          <div className="text-muted text-12">Drag to reorder &middot; click a step to edit</div>
        </div>
        <button className="btn-crm" disabled={saving} onClick={handleSave}>{saving ? 'Saving…' : 'Save Sequence'}</button>
      </div>

      {!linear && (
        <div className="crm-insight-banner warning my-3">
          <i className="bi bi-exclamation-triangle-fill" />
          This sequence has conditional branches that can't be shown as a simple list.
          <button className="btn btn-sm btn-outline-warning ms-2" onClick={() => navigate(`/campaigns/${id}/builder`)}>Open Advanced Builder</button>
        </div>
      )}

      {linear && (
        <div className="card crm-card mt-3">
          <div className="card-body p-4">
            <div className="crm-builder-step">
              <span className="crm-step-icon" style={{ background: '#dcfce71a', color: '#16a34a' }}><i className="bi bi-clock-history" /></span>
              <div className="flex-grow-1">
                <div className="fw-bold text-14">Trigger</div>
                <div className="text-muted text-12">
                  {entryRules.source_ids?.length ? `Auto-enrolls new leads from ${entryRules.source_ids.length} selected source(s)` : 'Manual enrollment only — add leads from the Leads page'}
                </div>
              </div>
            </div>

            {steps.map((step, i) => {
              const meta = STEP_META[step.type] || {};
              const editing = editingId === step.uid;
              return (
                <div key={step.uid}>
                  <div className="crm-builder-connector" />
                  <div
                    className="crm-builder-step clickable"
                    draggable
                    onDragStart={() => setDragIndex(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop(i)}
                    onClick={() => setEditingId(editing ? null : step.uid)}
                  >
                    <span className="crm-step-icon" style={{ background: `${meta.color}1a`, color: meta.color }}><i className={`bi bi-${meta.icon}`} /></span>
                    <div className="flex-grow-1 min-w-0">
                      <div className="fw-bold text-14 text-truncate">{stepTitle(step, templates)}</div>
                      <div className="text-muted text-12 text-truncate">{stepDescription(step, step.action_data || {}, { agents, stages })}</div>
                      {editing && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <StepEditor step={step} ad={step.action_data || {}} templates={templates} agents={agents} stages={stages}
                            onChange={(patch) => updateStep(step.uid, patch)} />
                        </div>
                      )}
                    </div>
                    <button className="crm-task-delete flex-shrink-0" onClick={(e) => { e.stopPropagation(); removeStep(step.uid); }}>
                      <i className="bi bi-trash3" />
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="crm-builder-connector" />
            {addingStep ? (
              <AddStepPicker onPick={addStep} onCancel={() => setAddingStep(false)} />
            ) : (
              <button className="crm-builder-add-btn" onClick={() => setAddingStep(true)}><i className="bi bi-plus-lg" /></button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
