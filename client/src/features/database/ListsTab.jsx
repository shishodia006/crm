import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import { useConfirm } from '../../hooks/useConfirm.js';

const CONDITION_FIELDS = [
  { value: 'status', label: 'Status' },
  { value: 'category', label: 'Category' },
  { value: 'industry', label: 'Industry' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'country', label: 'Country' },
  { value: 'score', label: 'Score' },
];
const OPERATORS = [
  { value: 'eq', label: 'is' },
  { value: 'neq', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'gte', label: '>=' },
  { value: 'lte', label: '<=' },
];
const LIST_ICONS = ['star-fill', 'graph-up-arrow', 'snow', 'bar-chart-fill', 'geo-alt-fill', 'calendar-check'];
const LIST_COLORS = ['#f59e0b', '#22c55e', '#0ea5e9', '#7c3aed', '#ec4899', '#0d9488'];

function ContactPicker({ selected, onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const search = async (value) => {
    setQuery(value);
    if (!value.trim()) { setResults([]); return; }
    try { const r = await api.get(`/api/leads?search=${encodeURIComponent(value)}&limit=8`); setResults(r?.leads ?? []); }
    catch { setResults([]); }
  };

  const toggle = (lead) => {
    if (selected.some((s) => s.id === lead.id)) onChange(selected.filter((s) => s.id !== lead.id));
    else onChange([...selected, lead]);
  };

  return (
    <div>
      <input className="crm-input" placeholder="Search contacts to add…" value={query} onChange={(e) => search(e.target.value)} />
      {results.length > 0 && (
        <div className="crm-lead-pick-results">
          {results.map((l) => (
            <button type="button" key={l.id} className="crm-lead-pick-item" onClick={() => toggle(l)}>
              <input type="checkbox" className="form-check-input me-2" readOnly checked={selected.some((s) => s.id === l.id)} />
              {l.name} <span className="text-muted-3 text-11 ms-1">{l.email || l.mobile}</span>
            </button>
          ))}
        </div>
      )}
      {selected.length > 0 && (
        <div className="mt-2 d-flex flex-wrap gap-1">
          {selected.map((s) => (
            <span key={s.id} className="badge badge-crm badge-purple">
              {s.name} <i className="bi bi-x ms-1" style={{ cursor: 'pointer' }} onClick={() => toggle(s)} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateListModal({ onClose, onCreated }) {
  const toast = useToast();
  const [type, setType] = useState('dynamic');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState([{ field: 'status', op: 'eq', value: '' }]);
  const [picked, setPicked] = useState([]);
  const [saving, setSaving] = useState(false);

  const updateRule = (i, patch) => setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRule = () => setRules((prev) => [...prev, { field: 'status', op: 'eq', value: '' }]);
  const removeRule = (i) => setRules((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = { name, description, type };
      if (type === 'dynamic') {
        payload.conditions = Object.fromEntries(rules.filter((r) => r.value !== '').map((r) => [r.field, { op: r.op, value: r.value }]));
      } else {
        payload.lead_ids = picked.map((p) => p.id);
      }
      const result = await api.post('/api/segments', payload);
      toast(`List created — ${result.added} contact(s) matched.`, 'success');
      onCreated();
    } catch (err) { toast(err.message, 'danger'); }
    finally { setSaving(false); }
  };

  return (
    <div className="crm-modal-backdrop" onClick={onClose}>
      <div className="crm-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="crm-modal-header">
          <div className="fw-bold text-15">New List</div>
          <button className="crm-drawer-close" onClick={onClose}><i className="bi bi-x-lg text-13" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-3"><label className="crm-label">Name</label><input className="crm-input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="mb-3"><label className="crm-label">Description</label><textarea className="crm-input no-resize" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="mb-3">
            <label className="crm-label">Type</label>
            <select className="crm-select w-100" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="dynamic">Dynamic — auto-updates as contacts match</option>
              <option value="static">Static — a fixed set of contacts</option>
            </select>
          </div>

          {type === 'dynamic' ? (
            <div className="mb-3">
              <label className="crm-label">Match contacts where…</label>
              {rules.map((rule, i) => (
                <div key={i} className="d-flex gap-2 mb-2">
                  <select className="crm-select" value={rule.field} onChange={(e) => updateRule(i, { field: e.target.value })}>
                    {CONDITION_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select className="crm-select" value={rule.op} onChange={(e) => updateRule(i, { op: e.target.value })}>
                    {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input className="crm-input" value={rule.value} onChange={(e) => updateRule(i, { value: e.target.value })} />
                  {rules.length > 1 && <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => removeRule(i)}><i className="bi bi-trash3" /></button>}
                </div>
              ))}
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={addRule}><i className="bi bi-plus-lg me-1" />Add condition</button>
            </div>
          ) : (
            <div className="mb-3">
              <label className="crm-label">Contacts</label>
              <ContactPicker selected={picked} onChange={setPicked} />
            </div>
          )}

          <div className="d-flex gap-2 mt-4">
            <button className="btn-crm flex-grow-1" disabled={saving}>{saving ? 'Saving…' : 'Create List'}</button>
            <button type="button" className="btn btn-outline-secondary rounded-crm-btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SegmentDrawer({ segmentId, onClose, onChanged }) {
  const toast = useToast();
  const { data, loading } = useResource(segmentId ? `/api/segments/${segmentId}/members` : '', [segmentId]);
  const segment = data?.segment;
  const leads = data?.leads ?? [];

  const handleRemove = async (leadId) => {
    try { await api.delete(`/api/segments/${segmentId}/members/${leadId}`); toast('Removed.', 'success'); onChanged(); }
    catch (err) { toast(err.message, 'danger'); }
  };

  return (
    <>
      {segmentId && <div className="crm-drawer-backdrop" onClick={onClose} />}
      <div className={`crm-drawer ${segmentId ? 'open' : ''}`}>
        {segment && (
          <>
            <div className="crm-drawer-header">
              <div className="crm-drawer-title"><i className="bi bi-people-fill" />{segment.name}</div>
              <button className="crm-drawer-close" onClick={onClose}><i className="bi bi-x-lg text-13" /></button>
            </div>
            <div className="crm-drawer-body">
              {segment.description && <p className="text-muted text-13">{segment.description}</p>}
              {loading ? <LoadingBox /> : leads.length === 0 ? (
                <p className="text-muted text-center py-4">No members yet.</p>
              ) : (
                <ul className="list-unstyled mb-0">
                  {leads.map((l) => (
                    <li key={l.id} className="d-flex justify-content-between align-items-center py-2 border-bottom">
                      <div><div className="fw-semibold text-13">{l.name}</div><div className="text-11 text-muted-3">{l.email || l.mobile}</div></div>
                      {segment.type === 'static' && (
                        <button className="btn btn-sm btn-outline-danger" onClick={() => handleRemove(l.id)}><i className="bi bi-x-lg" /></button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export default function ListsTab({ showCreate, onCloseCreate }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useResource('/api/segments');
  const segments = data?.segments ?? [];
  const [openSegmentId, setOpenSegmentId] = useState(null);

  const handleDelete = async (id) => {
    if (!(await confirm('Delete this list?', { title: 'Delete list' }))) return;
    try { await api.delete(`/api/segments/${id}`); toast('List deleted.', 'success'); reload(); }
    catch (err) { toast(err.message, 'danger'); }
  };

  if (loading) return <LoadingBox />;

  return (
    <div>
      {segments.length === 0 ? (
        <div className="card crm-card"><div className="card-body crm-empty">
          <i className="bi bi-collection crm-empty-icon" />
          <div className="crm-empty-title">No lists yet</div>
          <div className="crm-empty-sub">Group contacts into static or auto-updating dynamic lists.</div>
        </div></div>
      ) : (
        <div className="row g-3">
          {segments.map((s, i) => (
            <div className="col-md-6 col-xl-4" key={s.id}>
              <div className="card crm-report-card h-100" style={{ '--report-accent': LIST_COLORS[i % LIST_COLORS.length] }}>
                <div className="card-body p-4" onClick={() => setOpenSegmentId(s.id)} role="button">
                  <div className="d-flex justify-content-between align-items-start">
                    <div className="crm-report-icon" style={{ background: `${LIST_COLORS[i % LIST_COLORS.length]}1a`, color: LIST_COLORS[i % LIST_COLORS.length] }}>
                      <i className={`bi bi-${LIST_ICONS[i % LIST_ICONS.length]}`} />
                    </div>
                    <button className="btn btn-sm btn-outline-danger" onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}><i className="bi bi-trash3" /></button>
                  </div>
                  <div className="fw-bold text-14 mt-3 mb-1">{s.name}</div>
                  <div className="text-muted text-12 mb-3 crm-report-desc">{s.description || '—'}</div>
                  <div className="d-flex align-items-center justify-content-between crm-report-footer">
                    <span className="text-11 text-muted-3">{s.member_count} contact{s.member_count === 1 ? '' : 's'}</span>
                    <span className={`badge badge-crm badge-${s.type === 'static' ? 'draft' : 'live'}`}>{s.type === 'static' ? 'Static' : 'Dynamic'}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateListModal onClose={onCloseCreate} onCreated={() => { onCloseCreate(); reload(); }} />}
      <SegmentDrawer segmentId={openSegmentId} onClose={() => setOpenSegmentId(null)} onChanged={reload} />
    </div>
  );
}
