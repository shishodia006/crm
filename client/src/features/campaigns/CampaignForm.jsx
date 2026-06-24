import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';

const TYPES = [
  { value: 'drip',            label: 'Drip (Automated Sequence)' },
  { value: 'broadcast',       label: 'Broadcast' },
  { value: 'email_blast',     label: 'Email Blast' },
  { value: 'sms_blast',       label: 'SMS Blast' },
  { value: 'whatsapp_blast',  label: 'WhatsApp Blast' },
];

const GOALS = [
  { value: '',           label: 'None' },
  { value: 'converted',  label: 'Lead Converted' },
  { value: 'replied',    label: 'Lead Replied' },
  { value: 'clicked',    label: 'Clicked a Link' },
  { value: 'booked',     label: 'Appointment Booked' },
];

const BLANK = {
  name: '', description: '', type: 'drip', entry_source_ids: [], goal: '',
  reentry: 'always', reentry_after_days: 30,
  quiet_hours: { enabled: false, start: '21:00', end: '09:00' }
};

export default function CampaignForm() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(BLANK);
  const [sources, setSources] = useState([]);
  const [saving, setSaving] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const dropRef = useRef(null);

  useEffect(() => {
    api.get('/api/settings/sources')
      .then((d) => setSources(d.sources ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setSourceOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const set = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));

  const toggleSource = (id) => {
    setForm((p) => ({
      ...p,
      entry_source_ids: p.entry_source_ids.includes(id)
        ? p.entry_source_ids.filter((x) => x !== id)
        : [...p.entry_source_ids, id],
    }));
  };

  const sourceLabel = form.entry_source_ids.length === 0
    ? '— Manual only —'
    : form.entry_source_ids.length === 1
      ? (sources.find((s) => s.id === form.entry_source_ids[0])?.name ?? '1 source')
      : `${form.entry_source_ids.length} sources selected`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.post('/api/campaigns', form);
      toast('Campaign created.', 'success');
      navigate(`/campaigns/${r.id}/builder`);
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="d-flex flex-column align-items-center">
      {/* Page header */}
      <div className="w-100 max-w-560 mb-3 d-flex align-items-center">
        <h5 className="fw-bold mb-0">New Campaign</h5>
      </div>

      {/* Form card */}
      <div className="card crm-card w-100 max-w-560">
        <div className="card-body p-4">
          <h5 className="fw-bold mb-4">New Campaign</h5>
          <form onSubmit={handleSubmit}>

            <div className="mb-3">
              <label className="form-label text-13 fw-semibold">Campaign Name *</label>
              <input
                className="form-control"
                value={form.name}
                onChange={set('name')}
                placeholder=""
                required
                autoFocus
              />
            </div>

            <div className="mb-3">
              <label className="form-label text-13 fw-semibold">Description</label>
              <textarea
                className="form-control no-resize"
                value={form.description}
                onChange={set('description')}
                rows={3}
              />
            </div>

            <div className="row g-3 mb-3">
              <div className="col-6">
                <label className="form-label text-13 fw-semibold">Type</label>
                <select className="form-select" value={form.type} onChange={set('type')}>
                  {TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-6" ref={dropRef}>
                <label className="form-label text-13 fw-semibold">Auto-enroll from Source</label>
                <div className="position-relative">
                  <button
                    type="button"
                    className="form-select text-start d-flex align-items-center justify-content-between"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSourceOpen((p) => !p)}
                  >
                    <span className={form.entry_source_ids.length === 0 ? 'text-muted' : ''}>
                      {sourceLabel}
                    </span>
                    {form.entry_source_ids.length > 0 && (
                      <span
                        className="badge rounded-pill text-bg-primary ms-2 flex-shrink-0"
                        style={{ fontSize: '10px' }}
                      >
                        {form.entry_source_ids.length}
                      </span>
                    )}
                  </button>

                  {sourceOpen && (
                    <div
                      className="dropdown-menu show w-100 p-1 shadow-sm"
                      style={{ maxHeight: 240, overflowY: 'auto', zIndex: 1050 }}
                    >
                      <button
                        type="button"
                        className="dropdown-item text-12 text-muted py-1 px-2"
                        onClick={() => setForm((p) => ({ ...p, entry_source_ids: [] }))}
                      >
                        <i className="bi bi-x-circle me-1" />Clear selection (Manual only)
                      </button>
                      <div className="dropdown-divider my-1" />
                      {sources.map((s) => {
                        const checked = form.entry_source_ids.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className={`dropdown-item d-flex align-items-center gap-2 py-1 px-2 cursor-pointer rounded ${checked ? 'bg-primary bg-opacity-10' : ''}`}
                            style={{ fontSize: '13px' }}
                          >
                            <input
                              type="checkbox"
                              className="form-check-input m-0 flex-shrink-0"
                              checked={checked}
                              onChange={() => toggleSource(s.id)}
                            />
                            {s.name}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="form-label text-13 fw-semibold">Goal (exit condition)</label>
              <select className="form-select" value={form.goal} onChange={set('goal')}>
                {GOALS.map((g) => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>

            <div className="border rounded-3 p-3 mb-4 bg-light-subtle">
              <div className="fw-semibold text-13 mb-3"><i className="bi bi-sliders me-1" />Automation controls</div>
              <div className="row g-3">
                <div className="col-md-6">
                  <label className="form-label text-12 fw-semibold">Re-entry rule</label>
                  <select className="form-select form-select-sm" value={form.reentry} onChange={set('reentry')}>
                    <option value="always">Allow re-entry anytime</option>
                    <option value="never">Only once</option>
                    <option value="after_days">Allow after a waiting period</option>
                  </select>
                </div>
                {form.reentry === 'after_days' && (
                  <div className="col-md-6">
                    <label className="form-label text-12 fw-semibold">Wait before re-entry (days)</label>
                    <input type="number" min="1" className="form-control form-control-sm" value={form.reentry_after_days} onChange={set('reentry_after_days')} />
                  </div>
                )}
                <div className="col-12">
                  <label className="form-check-label text-12 fw-semibold d-flex align-items-center gap-2">
                    <input type="checkbox" className="form-check-input mt-0" checked={form.quiet_hours.enabled}
                      onChange={(e) => setForm((p) => ({ ...p, quiet_hours: { ...p.quiet_hours, enabled: e.target.checked } }))} />
                    Quiet hours — do not send during this window
                  </label>
                </div>
                {form.quiet_hours.enabled && (
                  <>
                    <div className="col-6"><label className="form-label text-12">Start</label><input type="time" className="form-control form-control-sm" value={form.quiet_hours.start} onChange={(e) => setForm((p) => ({ ...p, quiet_hours: { ...p.quiet_hours, start: e.target.value } }))} /></div>
                    <div className="col-6"><label className="form-label text-12">End</label><input type="time" className="form-control form-control-sm" value={form.quiet_hours.end} onChange={(e) => setForm((p) => ({ ...p, quiet_hours: { ...p.quiet_hours, end: e.target.value } }))} /></div>
                  </>
                )}
              </div>
            </div>

            <div className="d-flex gap-2">
              <button className="btn btn-primary px-4" disabled={saving}>
                {saving ? 'Creating…' : 'Create & Build Workflow →'}
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={() => navigate(-1)}>
                Cancel
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
