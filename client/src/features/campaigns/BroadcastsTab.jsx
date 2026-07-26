import { useState, useEffect } from 'react';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { formatDate } from '../../utils/formatters.js';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import { useConfirm } from '../../hooks/useConfirm.js';

const CHANNEL_BADGE = { email: 'purple', whatsapp: 'won', sms: 'source', rcs: 'purple' };
const STATUS_BADGE = { sent: 'live', scheduled: 'waiting', draft: 'draft' };
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

function CreateBroadcastModal({ onClose, onCreated }) {
  const toast = useToast();
  const [meta, setMeta] = useState(null);
  const [segments, setSegments] = useState([]);
  const [form, setForm] = useState({ name: '', template_id: '', audience_type: 'all_contacts', audience_value: '', start_at: '' });
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/api/meta'), api.get('/api/broadcasts/segments')])
      .then(([m, s]) => { setMeta(m); setSegments(s?.segments ?? []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams({ type: form.audience_type, value: form.audience_value || '' }).toString();
    api.get(`/api/broadcasts/audience-preview?${qs}`).then(setPreview).catch(() => setPreview(null));
  }, [form.audience_type, form.audience_value]);

  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value, ...(key === 'audience_type' ? { audience_value: '' } : {}) }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.template_id) return;
    setSaving(true);
    try {
      await api.post('/api/broadcasts', form);
      toast(form.start_at ? 'Broadcast scheduled.' : 'Broadcast saved as draft.', 'success');
      onCreated();
    } catch (err) { toast(err.message, 'danger'); }
    finally { setSaving(false); }
  };

  const templates = meta?.templates ?? [];
  const sources = meta?.sources ?? [];
  const stages = meta?.stages ?? [];

  return (
    <div className="crm-modal-backdrop" onClick={onClose}>
      <div className="crm-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="crm-modal-header">
          <div className="fw-bold text-15">New Broadcast</div>
          <button className="crm-modal-close" onClick={onClose}><i className="bi bi-x-lg text-13" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-3">
            <label className="crm-label">Name</label>
            <input className="crm-input" value={form.name} onChange={set('name')} required />
          </div>
          <div className="mb-3">
            <label className="crm-label">Template</label>
            <select className="crm-select w-100" value={form.template_id} onChange={set('template_id')} required>
              <option value="">— Select a template —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.channel})</option>)}
            </select>
          </div>
          <div className="mb-3">
            <label className="crm-label">Audience</label>
            <select className="crm-select w-100 mb-2" value={form.audience_type} onChange={set('audience_type')}>
              <option value="all_contacts">All contacts</option>
              <option value="active_leads">All active leads</option>
              <option value="lead_status">Leads with a specific status</option>
              <option value="lead_source">Leads from a specific source</option>
              <option value="pipeline_stage">Deals in a specific pipeline stage</option>
              <option value="segment">A saved segment</option>
            </select>
            {form.audience_type === 'lead_status' && (
              <select className="crm-select w-100" value={form.audience_value} onChange={set('audience_value')}>
                <option value="">— Select status —</option>
                {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {form.audience_type === 'lead_source' && (
              <select className="crm-select w-100" value={form.audience_value} onChange={set('audience_value')}>
                <option value="">— Select source —</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {form.audience_type === 'pipeline_stage' && (
              <select className="crm-select w-100" value={form.audience_value} onChange={set('audience_value')}>
                <option value="">— Select stage —</option>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {form.audience_type === 'segment' && (
              <select className="crm-select w-100" value={form.audience_value} onChange={set('audience_value')}>
                <option value="">— Select segment —</option>
                {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {preview && <div className="text-11 text-muted-3 mt-2">{preview.label}: <strong>{preview.count}</strong> recipients</div>}
          </div>
          <div className="mb-3">
            <label className="crm-label">Schedule (optional)</label>
            <input type="datetime-local" className="crm-input" value={form.start_at} onChange={set('start_at')} />
            <div className="text-11 text-muted-3 mt-1">Leave blank to save as a draft you send manually later.</div>
          </div>
          <div className="d-flex gap-2 mt-4">
            <button className="btn-crm flex-grow-1" disabled={saving}>{saving ? 'Saving…' : form.start_at ? 'Schedule' : 'Save Draft'}</button>
            <button type="button" className="btn btn-outline-secondary rounded-crm-btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BroadcastsTab({ showCreate, onCloseCreate }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useResource('/api/broadcasts');
  const broadcasts = data?.broadcasts ?? [];

  const handleSend = async (id) => {
    if (!(await confirm('Send this broadcast now?', { title: 'Send broadcast', danger: false, confirmLabel: 'Send' }))) return;
    try {
      const result = await api.post(`/api/broadcasts/${id}/send`, {});
      toast(`Sent to ${result.sent} of ${result.total} recipients.`, 'success');
      reload();
    } catch (err) { toast(err.message, 'danger'); }
  };

  const handleDelete = async (id) => {
    if (!(await confirm('Delete this broadcast?', { title: 'Delete broadcast' }))) return;
    try { await api.delete(`/api/broadcasts/${id}`); reload(); }
    catch (err) { toast(err.message, 'danger'); }
  };

  return (
    <div>
      {loading ? <LoadingBox /> : broadcasts.length === 0 ? (
        <div className="card crm-card"><div className="card-body crm-empty">
          <i className="bi bi-megaphone crm-empty-icon" />
          <div className="crm-empty-title">No broadcasts yet</div>
          <div className="crm-empty-sub">Send a one-off message to any audience.</div>
        </div></div>
      ) : (
        <div className="card crm-card"><div className="card-body p-4">
          <div className="table-responsive">
            <table className="table align-middle mb-0 crm-table">
              <thead><tr><th>Broadcast</th><th>Channel</th><th>Audience</th><th>Sent</th><th>Performance</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {broadcasts.map((b) => (
                  <tr key={b.id}>
                    <td className="fw-semibold text-13">{b.name}</td>
                    <td>{b.template_channel && <span className={`badge badge-crm badge-${CHANNEL_BADGE[b.template_channel] || 'source'}`}>{b.template_channel}</span>}</td>
                    <td className="text-12">{b.audience_label} &middot; {b.audience_count}</td>
                    <td className="text-12">
                      {b.status === 'sent' ? formatDate(b.updated_at) : b.status === 'scheduled' ? `Scheduled ${formatDate(b.start_at)}` : 'Draft'}
                    </td>
                    <td className="text-12">{b.open_rate == null ? '—' : `${b.open_rate}% opened`}</td>
                    <td><span className={`badge badge-crm badge-${STATUS_BADGE[b.status] || 'draft'}`}>{b.status}</span></td>
                    <td className="text-end">
                      {b.status !== 'sent' && (
                        <button className="btn btn-sm btn-outline-success me-1" onClick={() => handleSend(b.id)} title="Send now">
                          <i className="bi bi-send" />
                        </button>
                      )}
                      <button className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(b.id)}><i className="bi bi-trash3" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div></div>
      )}

      {showCreate && <CreateBroadcastModal onClose={onCloseCreate} onCreated={() => { onCloseCreate(); reload(); }} />}
    </div>
  );
}
