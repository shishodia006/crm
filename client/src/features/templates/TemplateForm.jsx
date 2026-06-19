import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';

const BLANK = { name: '', channel: 'email', subject: '', body: '', footer: '', wa_template_name: '', wa_language: 'en', status: 'draft' };

export default function TemplateForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(BLANK);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/api/templates/${id}`)
      .then((d) => setForm({ ...BLANK, ...d.template }))
      .catch(() => navigate('/templates'))
      .finally(() => setLoading(false));
  }, [id, isEdit, navigate]);

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/api/templates/${id}`, form);
        toast('Template updated.', 'success');
        navigate(`/templates/${id}`);
      } else {
        const r = await api.post('/api/templates', form);
        toast('Template created.', 'success');
        navigate(`/templates/${r.id}`);
      }
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBox />;

  return (
    <>
      <div className="d-flex align-items-center mb-4">
        <button className="btn btn-link text-muted p-0 me-3" onClick={() => navigate(-1)}>
          <i className="bi bi-arrow-left fs-5" />
        </button>
        <h4 className="fw-bold mb-0">{isEdit ? 'Edit Template' : 'New Template'}</h4>
      </div>
      <div className="card border-0 shadow-sm">
        <div className="card-body p-4">
          <form onSubmit={handleSubmit}>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Template Name *</label>
                <input name="name" value={form.name} onChange={handleChange} className="form-control" required />
              </div>
              <div className="col-md-3">
                <label className="form-label">Channel</label>
                <select name="channel" value={form.channel} onChange={handleChange} className="form-select">
                  {['email','whatsapp','sms','rcs'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label">Status</label>
                <select name="status" value={form.status} onChange={handleChange} className="form-select">
                  {['draft','approved','rejected'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {form.channel === 'email' && (
                <div className="col-12">
                  <label className="form-label">Subject</label>
                  <input name="subject" value={form.subject} onChange={handleChange} className="form-control" />
                </div>
              )}
              {form.channel === 'whatsapp' && (
                <>
                  <div className="col-md-6">
                    <label className="form-label">WA Template Name (exact)</label>
                    <input name="wa_template_name" value={form.wa_template_name} onChange={handleChange} className="form-control" />
                  </div>
                  <div className="col-md-3">
                    <label className="form-label">Language Code</label>
                    <input name="wa_language" value={form.wa_language} onChange={handleChange} className="form-control" />
                  </div>
                </>
              )}
              <div className="col-12">
                <label className="form-label">Body *</label>
                <p className="text-muted small mb-1">
                  Variables: <code>{'{{name}}'}</code> <code>{'{{email}}'}</code> <code>{'{{company}}'}</code> <code>{'{{mobile}}'}</code>
                </p>
                <textarea
                  name="body"
                  value={form.body}
                  onChange={handleChange}
                  className="form-control font-monospace"
                  rows={10}
                  required
                />
              </div>
              {form.channel === 'email' && (
                <div className="col-12">
                  <label className="form-label">Footer (optional)</label>
                  <textarea name="footer" value={form.footer} onChange={handleChange} className="form-control" rows={2} />
                </div>
              )}
            </div>
            <div className="mt-4 d-flex gap-2">
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Template'}</button>
              <button type="button" className="btn btn-outline-secondary" onClick={() => navigate(-1)}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
