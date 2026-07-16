import { useState, useEffect } from 'react';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import PasswordInput from '../../components/common/PasswordInput.jsx';

const FIELDS = [
  { name: 'app_name', label: 'Application Name' },
  { name: 'timezone', label: 'Company Timezone', placeholder: 'Asia/Kolkata' },
  { name: 'currency', label: 'Currency', placeholder: 'INR' },
];

const GOAL_FIELDS = [
  { name: 'goal_monthly_revenue', label: 'Monthly Revenue Target', type: 'number', placeholder: 'e.g. 200000' },
  { name: 'goal_monthly_deals', label: 'Monthly Deals Won Target', type: 'number', placeholder: 'e.g. 20' },
  { name: 'goal_monthly_leads', label: 'Monthly New Leads Target', type: 'number', placeholder: 'e.g. 1000' },
  { name: 'goal_monthly_demos', label: 'Monthly Demos Booked Target', type: 'number', placeholder: 'e.g. 250' },
];

const AI_FIELDS = [
  { name: 'ai_api_url', label: 'AI Provider URL', placeholder: 'https://api.openai.com/v1/chat/completions' },
  { name: 'ai_api_key', label: 'AI Provider API Key', type: 'password' },
  { name: 'ai_model', label: 'Model', placeholder: 'e.g. gpt-4o-mini' },
];

export default function GeneralSettings() {
  const toast = useToast();
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/settings').then((d) => setForm(d.settings ?? {})).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/settings', form);
      toast('Settings saved.', 'success');
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBox />;

  return (
    <div className="card crm-card">
      <div className="card-body p-4">
        <h6 className="fw-bold mb-1 text-brand">General</h6>
        <p className="text-muted text-12 mb-3">Workspace identity, monthly goals, and the AI provider used by My Analyst.</p>
        <hr className="mb-3" />
        <form onSubmit={handleSubmit}>
          <div className="row g-3">
            {FIELDS.map((f) => (
              <div key={f.name} className="col-md-6">
                <label className="form-label">{f.label}</label>
                <input
                  type={f.type || 'text'}
                  className="form-control"
                  value={form[f.name] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <h6 className="fw-semibold mt-4 mb-1">Monthly Goals</h6>
          <p className="text-muted text-12 mb-3">Used by the Dashboard's Overview and Pipeline tabs to show progress and pacing.</p>
          <div className="row g-3">
            {GOAL_FIELDS.map((f) => (
              <div key={f.name} className="col-md-6">
                <label className="form-label">{f.label}</label>
                <input
                  type={f.type || 'text'}
                  className="form-control"
                  value={form[f.name] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          <h6 className="fw-semibold mt-4 mb-1">AI Provider (My Analyst)</h6>
          <p className="text-muted text-12 mb-3">An OpenAI-compatible chat-completions endpoint. Powers the My Analyst chat and AI Agents.</p>
          <div className="row g-3">
            {AI_FIELDS.map((f) => (
              <div key={f.name} className="col-md-6">
                <label className="form-label">{f.label}</label>
                {f.type === 'password' ? (
                  <PasswordInput
                    value={form[f.name] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))}
                  />
                ) : (
                  <input
                    type={f.type || 'text'}
                    className="form-control"
                    value={form[f.name] ?? ''}
                    placeholder={f.placeholder}
                    onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-4">
            <button className="btn-crm" disabled={saving}>
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
