import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';

const BLANK = {
  name: '', email: '', mobile: '', company: '', designation: '',
  industry: '', city: '', state: '', country: 'India',
  product_interest: '', source_id: '', status: 'new'
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

  useEffect(() => {
    api.get('/api/meta').then((d) => setSources(d.sources ?? []));
    if (isEdit) {
      api.get(`/api/leads/${id}`).then((d) => {
        const l = d.lead;
        setForm({ ...BLANK, ...l });
      }).catch(() => navigate('/leads')).finally(() => setLoading(false));
    }
  }, [id, isEdit, navigate]);

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/api/leads/${id}`, form);
        toast('Lead updated.', 'success');
        navigate(`/leads/${id}`);
      } else {
        const r = await api.post('/api/leads', form);
        toast('Lead created.', 'success');
        navigate(`/leads/${r.id}`);
      }
    } catch (err) {
      toast(err.message || 'Save failed', 'danger');
    } finally {
      setSaving(false);
    }
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
                  {['new','contacted','qualified','disqualified'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-12">
                <label className="form-label">Product Interest / Requirement</label>
                <textarea name="product_interest" value={form.product_interest ?? ''} onChange={handleChange} className="form-control" rows={3} />
              </div>
            </div>
            <div className="mt-4 d-flex gap-2">
              <button className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save Lead'}
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={() => navigate(-1)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
