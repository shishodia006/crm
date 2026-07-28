import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';

const BLANK = {
  name: '', email: '', mobile: '', company: '', designation: '',
  industry: '', city: '', state: '', country: 'India',
  product_interest: '', source_id: '', status: 'new', lead_type: ''
};

export default function LeadForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(BLANK);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);

  useEffect(() => {
    api.get('/api/meta').then((d) => setSources(d.sources ?? []));
    if (isEdit) {
      api.get(`/api/leads/${id}`).then((d) => {
        const l = d.lead;
        setForm({ ...BLANK, ...l });
      }).catch((err) => { toast(err.message || 'Could not load this lead.', 'danger'); navigate('/leads'); }).finally(() => setLoading(false));
    }
  }, [id, isEdit, navigate]);

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const createLead = async () => {
    setSaving(true);
    try {
      const r = await api.post('/api/leads', form);
      toast(r.is_duplicate ? 'Lead already existed — merged into it.' : 'Lead created.', 'success');
      navigate(`/leads/${r.lead_id}`);
    } catch (err) {
      toast(err.message || 'Save failed', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isEdit) {
      setSaving(true);
      try {
        await api.patch(`/api/leads/${id}`, form);
        toast('Lead updated.', 'success');
        navigate(`/leads/${id}`);
      } catch (err) {
        toast(err.message || 'Save failed', 'danger');
      } finally {
        setSaving(false);
      }
      return;
    }

    // New lead: check for an existing lead on the same email/mobile first so the
    // user can decide whether to proceed, instead of silently merging into it.
    setSaving(true);
    try {
      const { duplicate: existing } = await api.get(
        `/api/leads/check-duplicate?email=${encodeURIComponent(form.email || '')}&mobile=${encodeURIComponent(form.mobile || '')}`
      );
      if (existing) {
        setSaving(false);
        setDuplicate(existing);
        return;
      }
    } catch {
      // If the check itself fails, fall through to the normal create — the
      // backend still enforces dedup, this is just a heads-up UX layer.
    }
    await createLead();
  };

  if (loading) return <LoadingBox />;

  const field = (label, name, type = 'text', required = false) => (
    <div className="col-md-6">
      <label className="form-label">{label}{required && ' *'}</label>
      <input
        type={type}
        name={name}
        value={form[name] ?? ''}
        onChange={handleChange}
        className="form-control"
        required={required}
      />
    </div>
  );

  return (
    <>
      <div className="d-flex align-items-center mb-4">
        <button className="btn btn-link text-muted p-0 me-3" onClick={() => navigate(-1)}>
          <i className="bi bi-arrow-left fs-5" />
        </button>
        <h4 className="fw-bold mb-0">{isEdit ? 'Edit Lead' : 'New Lead'}</h4>
      </div>
      <div className="card border-0 shadow-sm">
        <div className="card-body p-4">
          <form onSubmit={handleSubmit}>
            <div className="row g-3">
              {field('Full Name', 'name', 'text', true)}
              {field('Email', 'email', 'email')}
              {field('Mobile', 'mobile')}
              {field('Company', 'company')}
              {field('Designation', 'designation')}
              {field('Industry', 'industry')}
              {field('City', 'city')}
              {field('State', 'state')}
              {field('Country', 'country')}
              <div className="col-md-6">
                <label className="form-label">Source</label>
                <select name="source_id" value={form.source_id ?? ''} onChange={handleChange} className="form-select">
                  <option value="">— Select Source —</option>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Status</label>
                <select name="status" value={form.status} onChange={handleChange} className="form-select">
                  {['new','contacted','qualified','proposal','negotiation','won','lost','unsubscribed','invalid'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Type of Lead</label>
                <select name="lead_type" value={form.lead_type ?? ''} onChange={handleChange} className="form-select">
                  <option value="">— Not set —</option>
                  <option value="direct_client">Direct Client</option>
                  <option value="partner_client">Partner Client</option>
                </select>
              </div>
              <div className="col-12">
                <label className="form-label">Product Interest / Requirement</label>
                <textarea name="product_interest" value={form.product_interest ?? ''} onChange={handleChange} className="form-control" rows={3} />
              </div>
            </div>
            <div className="mt-4 d-flex gap-2">
              <button className="btn-crm" disabled={saving}>
                {saving ? 'Saving…' : 'Save Lead'}
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={() => navigate(-1)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>

      {duplicate && (
        <>
          <div className="modal d-block" tabIndex="-1" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Lead already exists</h5>
                </div>
                <div className="modal-body">
                  <p className="mb-1">
                    A lead with this email/mobile already exists:
                  </p>
                  <p className="fw-bold mb-1">{duplicate.name}</p>
                  <p className="text-muted mb-0 text-13">
                    {duplicate.email || '—'} · {duplicate.mobile || '—'} · status: {duplicate.status}
                  </p>
                  <p className="mt-3 mb-0">Do you want to add it again anyway?</p>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => { setDuplicate(null); navigate(`/leads/${duplicate.id}`); }}
                  >
                    No, open existing
                  </button>
                  <button
                    type="button"
                    className="btn-crm"
                    disabled={saving}
                    onClick={async () => { setDuplicate(null); await createLead(); }}
                  >
                    {saving ? 'Saving…' : 'Yes, add anyway'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
