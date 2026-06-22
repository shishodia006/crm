import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';

const BLANK = {
  name: '', channel: 'email', subject: '', body: '',
  wa_template_id: '', status: 'draft',
};

function parseVarCount(variables) {
  if (!variables) return '';
  try {
    const v = typeof variables === 'string' ? JSON.parse(variables) : variables;
    return v?.count != null ? String(v.count) : '';
  } catch { return ''; }
}

export default function TemplateForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(id);
  const [form, setForm] = useState(BLANK);
  const [varCount, setVarCount] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/api/templates/${id}`)
      .then((d) => {
        setForm({ ...BLANK, ...d.template });
        setVarCount(parseVarCount(d.template.variables));
      })
      .catch(() => navigate('/templates'))
      .finally(() => setLoading(false));
  }, [id, isEdit, navigate]);

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  // Auto-detect variable count from body on change
  const handleBodyChange = (e) => {
    const body = e.target.value;
    setForm((p) => ({ ...p, body }));
    const matches = body.match(/\{\{(\w+)\}\}/g) || [];
    if (matches.length > 0 && !varCount) setVarCount(String(matches.length));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        variable_count: varCount !== '' ? Number(varCount) : null,
      };
      if (isEdit) {
        await api.patch(`/api/templates/${id}`, payload);
        toast('Template updated.', 'success');
        navigate(`/templates/${id}`);
      } else {
        const r = await api.post('/api/templates', payload);
        toast('Template created.', 'success');
        navigate(`/templates/${r.id}`);
      }
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  // Detect from current body
  const detectedCount = ((form.body || '').match(/\{\{(\w+)\}\}/g) || []).length;
  const isWaRcs = ['whatsapp', 'rcs'].includes(form.channel);

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
                  {['draft','active','archived'].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {form.channel === 'email' && (
                <div className="col-12">
                  <label className="form-label">Subject</label>
                  <input name="subject" value={form.subject} onChange={handleChange} className="form-control" />
                </div>
              )}

              {isWaRcs && (
                <div className="col-12">
                  <div className="row g-3">
                    <div className="col-md-7">
                      <label className="form-label">
                        Anantya Template ID
                        <span className="text-muted text-12 ms-1">(auto-filled on sync — do not edit)</span>
                      </label>
                      <input
                        name="wa_template_id"
                        value={form.wa_template_id || ''}
                        onChange={handleChange}
                        className="form-control font-monospace text-13"
                        placeholder="Sync from Anantya in WorkflowBuilder to fill this"
                      />
                    </div>
                    <div className="col-md-5">
                      <label className="form-label">
                        Variable Count
                        <span className="text-muted text-12 ms-1">(how many {`{{N}}`} params Anantya expects)</span>
                      </label>
                      <div className="input-group">
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={varCount}
                          onChange={(e) => setVarCount(e.target.value)}
                          className="form-control"
                          placeholder="0"
                        />
                        {detectedCount > 0 && Number(varCount) !== detectedCount && (
                          <button
                            type="button"
                            className="btn btn-outline-secondary text-12"
                            onClick={() => setVarCount(String(detectedCount))}
                          >
                            Use {detectedCount}
                          </button>
                        )}
                      </div>
                      {detectedCount > 0 && (
                        <div className="text-success text-11 mt-1">
                          <i className="bi bi-check-circle me-1" />
                          {detectedCount} variable{detectedCount !== 1 ? 's' : ''} detected in body
                        </div>
                      )}
                      {detectedCount === 0 && varCount === '' && (
                        <div className="text-warning text-11 mt-1">
                          <i className="bi bi-exclamation-triangle me-1" />
                          Set this to match how many {`{{1}}`}, {`{{2}}`}… your Anantya template has
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="col-12">
                <label className="form-label">Body *</label>
                <p className="text-muted small mb-1">
                  {isWaRcs
                    ? <>Use <code>{'{{1}}'}</code> <code>{'{{2}}'}</code>… matching exact Anantya template variables. Or named: <code>{'{{name}}'}</code> <code>{'{{company}}'}</code></>
                    : <>Variables: <code>{'{{name}}'}</code> <code>{'{{email}}'}</code> <code>{'{{company}}'}</code> <code>{'{{mobile}}'}</code></>
                  }
                </p>
                <textarea
                  name="body"
                  value={form.body}
                  onChange={handleBodyChange}
                  className="form-control font-monospace"
                  rows={10}
                  required
                />
              </div>
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
