import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';

const BLANK = {
  title: '', lead_id: '', stage_id: '', value: 0,
  probability: 50, expected_close_date: '', assigned_to: '', notes: '',
};

export default function DealForm() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(BLANK);
  const [stages, setStages] = useState([]);
  const [leads, setLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/api/settings/pipeline'),
      api.get('/api/leads?limit=500'),
      api.get('/api/settings/users'),
    ]).then(([stg, ldsData, usrData]) => {
      setStages(stg.stages ?? []);
      setLeads(ldsData.leads ?? []);
      setUsers(usrData.users ?? []);
    });
  }, []);

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.post('/api/deals', form);
      toast('Deal created.', 'success');
      navigate(`/deals/${r.id}`);
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="d-flex flex-column align-items-center">
      {/* Header */}
      <div className="w-100 max-w-560 mb-3 d-flex align-items-center">
        <button className="btn btn-link text-muted p-0 me-2" onClick={() => navigate(-1)}>
          <i className="bi bi-arrow-left fs-5" />
        </button>
        <h5 className="fw-bold mb-0">New Deal</h5>
      </div>

      {/* Form card */}
      <div className="card crm-card w-100 max-w-560">
        <div className="card-body p-4">
          <form onSubmit={handleSubmit}>

            <div className="mb-3">
              <label className="form-label text-13 fw-semibold">Deal Title *</label>
              <input
                name="title"
                value={form.title}
                onChange={handleChange}
                className="form-control form-control-sm"
                placeholder="Enter deal title"
                required
              />
            </div>

            <div className="mb-3">
              <label className="form-label text-13 fw-semibold">Lead *</label>
              <select name="lead_id" value={form.lead_id} onChange={handleChange} className="form-select form-select-sm" required>
                <option value="">— Select Lead —</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}{l.company ? ` (${l.company})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label text-13 fw-semibold">Stage *</label>
              <select name="stage_id" value={form.stage_id} onChange={handleChange} className="form-select form-select-sm" required>
                <option value="">— Select Stage —</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="row g-3 mb-3">
              <div className="col-6">
                <label className="form-label text-13 fw-semibold">Deal Value (₹)</label>
                <input
                  name="value"
                  type="number"
                  value={form.value}
                  onChange={handleChange}
                  className="form-control form-control-sm"
                  min={0}
                />
              </div>
              <div className="col-6">
                <label className="form-label text-13 fw-semibold">Probability (%)</label>
                <input
                  name="probability"
                  type="number"
                  value={form.probability}
                  onChange={handleChange}
                  className="form-control form-control-sm"
                  min={0}
                  max={100}
                />
              </div>
            </div>

            <div className="row g-3 mb-3">
              <div className="col-6">
                <label className="form-label text-13 fw-semibold">Expected Close</label>
                <input
                  name="expected_close_date"
                  type="date"
                  value={form.expected_close_date}
                  onChange={handleChange}
                  className="form-control form-control-sm"
                />
              </div>
              <div className="col-6">
                <label className="form-label text-13 fw-semibold">Assign To</label>
                <select name="assigned_to" value={form.assigned_to} onChange={handleChange} className="form-select form-select-sm">
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="form-label text-13 fw-semibold">Notes</label>
              <textarea
                name="notes"
                value={form.notes}
                onChange={handleChange}
                className="form-control form-control-sm no-resize"
                rows={3}
                placeholder="Optional notes…"
              />
            </div>

            <div className="d-flex gap-2">
              <button className="btn btn-crm btn-crm-sm flex-grow-1" disabled={saving}>
                {saving ? 'Saving…' : 'Create Deal'}
              </button>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => navigate(-1)}>
                Cancel
              </button>
            </div>

          </form>
        </div>
      </div>
    </div>
  );
}
