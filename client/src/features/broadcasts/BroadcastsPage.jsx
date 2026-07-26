import { useState, useEffect } from 'react';
import { useResource } from '../../hooks/useResource.js';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import { useConfirm } from '../../hooks/useConfirm.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { timeAgo } from '../../utils/formatters.js';

const CHANNELS = [
  { value: 'email', label: 'Email', icon: 'envelope-fill' },
  { value: 'whatsapp', label: 'WhatsApp', icon: 'whatsapp' },
  { value: 'sms', label: 'SMS', icon: 'chat-dots-fill' },
  { value: 'rcs', label: 'RCS', icon: 'phone-vibrate-fill' },
];
const CHANNEL_ICON = Object.fromEntries(CHANNELS.map((c) => [c.value, c.icon]));
const STATUS_OPTS = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

function NewBroadcastModal({ open, onClose, onDone, audienceTypes }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [channel, setChannel] = useState('email');
  const [templates, setTemplates] = useState([]);
  const [sources, setSources] = useState([]);
  const [stages, setStages] = useState([]);
  const [segments, setSegments] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [audienceType, setAudienceType] = useState('lead_source');
  const [audienceValue, setAudienceValue] = useState('');
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(''); setChannel('email'); setTemplateId(''); setAudienceType('lead_source'); setAudienceValue(''); setPreview(null);
    api.get('/api/meta').then((d) => { setTemplates(d?.templates ?? []); setSources(d?.sources ?? []); setStages(d?.stages ?? []); }).catch(() => {});
    api.get('/api/broadcasts/segments').then((d) => setSegments(d?.segments ?? [])).catch(() => {});
  }, [open]);

  const templatesForChannel = templates.filter((t) => t.channel === channel);
  const needsValue = ['lead_status', 'lead_source', 'pipeline_stage', 'segment'].includes(audienceType);

  useEffect(() => {
    if (!open) return;
    if (needsValue && !audienceValue) { setPreview(null); return; }
    const params = new URLSearchParams({ type: audienceType, value: audienceValue || '' });
    api.get(`/api/broadcasts/audience-preview?${params}`).then(setPreview).catch(() => setPreview(null));
  }, [audienceType, audienceValue, open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const submit = async (sendNow) => {
    if (!name.trim()) return toast('Broadcast name is required.', 'danger');
    if (!templateId) return toast('Pick a template first.', 'danger');
    setSaving(true);
    try {
      const created = await api.post('/api/broadcasts', {
        name, template_id: templateId, audience_type: audienceType, audience_value: audienceValue || null,
      });
      if (sendNow) {
        const sendRes = await api.post(`/api/broadcasts/${created.id}/send`, {});
        toast(`Sent to ${sendRes.sent} of ${sendRes.total} leads.`, 'success');
      } else {
        toast('Broadcast saved as draft.', 'success');
      }
      onDone?.();
      onClose();
    } catch (err) { toast(err.message || 'Failed to create broadcast.', 'danger'); }
    finally { setSaving(false); }
  };

  return (
    <>
      <div className="crm-drawer-backdrop" onClick={onClose} />
      <div className="crm-drawer open">
        <div className="crm-drawer-header">
          <div className="crm-drawer-title"><i className="bi bi-megaphone-fill" />New Broadcast</div>
          <button className="crm-drawer-close" onClick={onClose}><i className="bi bi-x-lg text-13" /></button>
        </div>
        <div className="crm-drawer-body">
          <div className="mb-3">
            <label className="crm-label">Broadcast Name <span className="req">*</span></label>
            <input className="crm-input" placeholder="e.g. LPF Excel Import — WhatsApp Blast" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="mb-3">
            <label className="crm-label">Channel</label>
            <div className="crm-tabs">
              {CHANNELS.map((c) => (
                <button key={c.value} type="button" className={`crm-tab${channel === c.value ? ' active' : ''}`}
                  onClick={() => { setChannel(c.value); setTemplateId(''); }}>
                  <i className={`bi bi-${c.icon} me-1`} />{c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <label className="crm-label">Template <span className="req">*</span></label>
            <select className="crm-select w-100" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">— Select a template —</option>
              {templatesForChannel.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {templatesForChannel.length === 0 && (
              <div className="text-11 text-muted-3 mt-1">No {channel} templates yet — create one in Templates first.</div>
            )}
          </div>

          <div className="mb-3">
            <label className="crm-label">Audience</label>
            <select className="crm-select w-100 mb-2" value={audienceType} onChange={(e) => { setAudienceType(e.target.value); setAudienceValue(''); }}>
              {(audienceTypes ?? []).map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            </select>

            {audienceType === 'lead_source' && (
              <select className="crm-select w-100" value={audienceValue} onChange={(e) => setAudienceValue(e.target.value)}>
                <option value="">— Select a source —</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {audienceType === 'lead_status' && (
              <select className="crm-select w-100" value={audienceValue} onChange={(e) => setAudienceValue(e.target.value)}>
                <option value="">— Select a status —</option>
                {STATUS_OPTS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            )}
            {audienceType === 'pipeline_stage' && (
              <select className="crm-select w-100" value={audienceValue} onChange={(e) => setAudienceValue(e.target.value)}>
                <option value="">— Select a stage —</option>
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {audienceType === 'segment' && (
              <select className="crm-select w-100" value={audienceValue} onChange={(e) => setAudienceValue(e.target.value)}>
                <option value="">— Select a segment —</option>
                {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}

            {preview && (
              <div className="crm-insight-banner positive mt-2">
                <i className="bi bi-people-fill" />{preview.count} lead{preview.count === 1 ? '' : 's'} match — {preview.label}
              </div>
            )}
          </div>
        </div>
        <div className="crm-drawer-footer">
          <button className="btn-crm btn-crm-lg flex-grow-1" disabled={saving} onClick={() => submit(true)}>
            {saving ? <><span className="spinner-border spinner-border-sm me-2" />Sending…</> : <><i className="bi bi-send-fill" />Send Now</>}
          </button>
          <button className="btn btn-outline-secondary rounded-crm-btn fw-semibold text-13" disabled={saving} onClick={() => submit(false)}>Save Draft</button>
          <button className="btn btn-outline-secondary rounded-crm-btn fw-semibold text-13 min-w-90" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
}

export default function BroadcastsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  // Poll while anything is actively sending so progress (sent_count) updates live
  // without the user needing to refresh the page.
  const { data, loading, reload } = useResource('/api/broadcasts', [], 4000);
  const broadcasts = data?.broadcasts ?? [];
  const audienceTypes = data?.audienceTypes ?? [];

  const handleSend = async (id) => {
    try {
      await api.post(`/api/broadcasts/${id}/send`, {});
      toast('Broadcast started — sending in the background.', 'success');
      reload();
    } catch (err) { toast(err.message, 'danger'); }
  };

  const handleDelete = async (id) => {
    if (!(await confirm('This cannot be undone.', { title: 'Delete this broadcast?', danger: true }))) return;
    try { await api.delete(`/api/broadcasts/${id}`); toast('Broadcast deleted.', 'success'); reload(); }
    catch (err) { toast(err.message, 'danger'); }
  };

  return (
    <div>
      <div className="d-flex align-items-center mb-4 gap-2 flex-wrap">
        <h5 className="fw-bold mb-0 me-auto text-brand">Broadcasts</h5>
        <button className="btn-crm" onClick={() => setModalOpen(true)}><i className="bi bi-plus-lg" />New Broadcast</button>
      </div>

      {loading ? <LoadingBox /> : broadcasts.length === 0 ? (
        <div className="card crm-card"><div className="crm-empty py-5">
          <i className="bi bi-megaphone crm-empty-icon" />
          <div className="crm-empty-title">No broadcasts yet</div>
          <div className="crm-empty-sub">Send a one-time message to a filtered group of leads — e.g. everyone from a bulk import.</div>
        </div></div>
      ) : (
        <div className="row g-3">
          {broadcasts.map((b) => (
            <div key={b.id} className="col-lg-6">
              <div className="card crm-card h-100"><div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <div>
                    <div className="fw-bold text-15 text-brand"><i className={`bi bi-${CHANNEL_ICON[b.template_channel] || 'megaphone-fill'} me-1`} />{b.name}</div>
                    <div className="text-11 text-muted-3">{b.audience_label} · {b.audience_count} lead{b.audience_count === 1 ? '' : 's'}</div>
                  </div>
                  {b.status === 'sending' ? (
                    <span className="badge badge-crm badge-waiting"><span className="spinner-border spinner-border-sm me-1" style={{ width: 10, height: 10 }} />Sending…</span>
                  ) : (
                    <span className={`badge badge-crm badge-${b.status === 'sent' ? 'live' : b.status === 'scheduled' ? 'waiting' : 'draft'} text-capitalize`}>
                      {b.status === 'sent' ? 'Completed' : b.status}
                    </span>
                  )}
                </div>

                {b.status === 'sending' && (
                  <div className="mb-2">
                    <div className="crm-progress">
                      <div className="crm-progress-fill" style={{ width: `${b.audience_count ? Math.min(100, Math.round((b.sent_count / b.audience_count) * 100)) : 0}%`, background: '#4d50d8' }} />
                    </div>
                    <div className="text-11 text-muted-3 mt-1">{b.sent_count || 0} / {b.audience_count} sent so far</div>
                  </div>
                )}

                <div className="row g-2 text-center my-3">
                  <div className="col-4"><div className="fw-bold text-16">{b.sent_count || 0}</div><div className="text-11 text-muted-3">Sent</div></div>
                  <div className="col-4"><div className="fw-bold text-16">{b.open_rate == null ? '—' : `${b.open_rate}%`}</div><div className="text-11 text-muted-3">Open Rate</div></div>
                  <div className="col-4"><div className="fw-bold text-16">{timeAgo(b.created_at)}</div><div className="text-11 text-muted-3">Created</div></div>
                </div>
                <div className="d-flex gap-2">
                  {(b.status === 'draft' || b.status === 'scheduled') && (
                    <button className="btn-crm btn-crm-sm flex-grow-1" onClick={() => handleSend(b.id)}>
                      <i className="bi bi-send-fill" />Send Now
                    </button>
                  )}
                  {b.status === 'sending' && (
                    <button className="btn btn-outline-secondary btn-sm flex-grow-1" disabled>
                      <span className="spinner-border spinner-border-sm me-1" />In Progress…
                    </button>
                  )}
                  <button className="btn btn-outline-danger btn-sm" disabled={b.status === 'sending'} onClick={() => handleDelete(b.id)}><i className="bi bi-trash" /></button>
                </div>
              </div></div>
            </div>
          ))}
        </div>
      )}

      <NewBroadcastModal open={modalOpen} onClose={() => setModalOpen(false)} onDone={reload} audienceTypes={audienceTypes} />
    </div>
  );
}
