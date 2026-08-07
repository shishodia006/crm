import { useState, useEffect } from 'react';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import { useConfirm } from '../../hooks/useConfirm.js';
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

// One-click presets: picking a provider fills in its OpenAI-compatible endpoint
// (Gemini/Groq both offer one) so nobody has to hand-type or guess the URL —
// only the API key and a model choice are actually provider-specific.
const AI_PROVIDER_PRESETS = [
  { key: 'custom', label: 'Custom / Other (OpenAI-compatible)', url: '', models: [] },
  { key: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1/chat/completions', models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'] },
  { key: 'gemini', label: 'Google Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', models: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'] },
  { key: 'groq', label: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] },
];

function detectAiProvider(url) {
  if (!url) return 'custom';
  if (url.includes('googleapis.com')) return 'gemini';
  if (url.includes('groq.com')) return 'groq';
  if (url.includes('api.openai.com')) return 'openai';
  return 'custom';
}

export default function GeneralSettings() {
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiProvider, setAiProvider] = useState('custom');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [deletingKey, setDeletingKey] = useState(false);

  useEffect(() => {
    api.get('/api/settings').then((d) => {
      const settings = d.settings ?? {};
      setForm(settings);
      setAiProvider(detectAiProvider(settings.ai_api_url));
    }).finally(() => setLoading(false));
    api.get('/api/settings/api-key').then((d) => setApiKey(d.api_key ?? '')).catch(() => {});
  }, []);

  const copyApiKey = () => {
    navigator.clipboard.writeText(apiKey);
    toast('API key copied.', 'success');
  };

  const generateApiKey = async () => {
    setRegenerating(true);
    try {
      const d = await api.post('/api/settings/api-key/regenerate');
      setApiKey(d.api_key);
      setApiKeyVisible(true);
      toast('API key generated.', 'success');
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setRegenerating(false);
    }
  };

  const regenerateApiKey = async () => {
    const yes = await confirm(
      'Any integration (Zapier, custom script, etc.) using the current key will stop working until you update it with the new one. This cannot be undone.',
      { title: 'Regenerate API key?', danger: true, confirmLabel: 'Regenerate' }
    );
    if (!yes) return;
    setRegenerating(true);
    try {
      const d = await api.post('/api/settings/api-key/regenerate');
      setApiKey(d.api_key);
      setApiKeyVisible(true);
      toast('API key regenerated.', 'success');
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setRegenerating(false);
    }
  };

  const deleteApiKey = async () => {
    const yes = await confirm(
      'Any integration using this key will start getting 401 errors immediately. You can generate a new one anytime.',
      { title: 'Delete API key?', danger: true, confirmLabel: 'Delete' }
    );
    if (!yes) return;
    setDeletingKey(true);
    try {
      await api.delete('/api/settings/api-key');
      setApiKey('');
      setApiKeyVisible(false);
      toast('API key deleted.', 'success');
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setDeletingKey(false);
    }
  };

  const handleProviderChange = (key) => {
    setAiProvider(key);
    const preset = AI_PROVIDER_PRESETS.find((p) => p.key === key);
    if (preset && preset.url) setForm((p) => ({ ...p, ai_api_url: preset.url }));
  };

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

          <h6 className="fw-semibold mt-4 mb-1">API Key</h6>
          <p className="text-muted text-12 mb-3">
            One key for this workspace — shared by every team member, invited or not. Use it to authenticate{' '}
            <code>POST /ingest/:source</code> calls from Zapier, custom scripts, or any other outside system pushing leads in.
          </p>
          <div className="row g-3">
            <div className="col-md-8">
              <label className="form-label">Your API Key</label>
              {apiKey ? (
                <>
                  <div className="d-flex align-items-center gap-2">
                    <input
                      type={apiKeyVisible ? 'text' : 'password'}
                      className="form-control font-monospace"
                      value={apiKey}
                      readOnly
                      autoComplete="one-time-code"
                      data-1p-ignore="true"
                      data-lpignore="true"
                    />
                    <button type="button" className="btn btn-outline-secondary flex-shrink-0" title={apiKeyVisible ? 'Hide' : 'Show'} onClick={() => setApiKeyVisible((v) => !v)}>
                      <i className={`bi bi-eye${apiKeyVisible ? '-slash' : ''}`} />
                    </button>
                    <button type="button" className="btn btn-outline-secondary flex-shrink-0" title="Copy" disabled={!apiKey} onClick={copyApiKey}>
                      <i className="bi bi-clipboard" />
                    </button>
                    <button type="button" className="btn btn-outline-secondary flex-shrink-0 text-nowrap" disabled={regenerating || deletingKey} onClick={regenerateApiKey}>
                      {regenerating ? 'Regenerating…' : 'Regenerate'}
                    </button>
                    <button type="button" className="btn btn-outline-danger flex-shrink-0 text-nowrap" disabled={regenerating || deletingKey} onClick={deleteApiKey}>
                      {deletingKey ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                  <div className="text-11 text-muted-3 mt-1">Regenerating or deleting immediately invalidates this key — anything still using it will start getting 401 errors.</div>
                </>
              ) : (
                <>
                  <div>
                    <button type="button" className="btn btn-brand" disabled={regenerating} onClick={generateApiKey}>
                      {regenerating ? 'Generating…' : 'Generate API Key'}
                    </button>
                  </div>
                  <div className="text-11 text-muted-3 mt-1">No key yet — nothing outside the CRM can push leads in until you generate one.</div>
                </>
              )}
            </div>
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
          <p className="text-muted text-12 mb-3">Pick a provider — the endpoint URL fills in automatically. Powers the My Analyst chat and AI Agents.</p>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">Provider</label>
              <select className="form-select" value={aiProvider} onChange={(e) => handleProviderChange(e.target.value)}>
                {AI_PROVIDER_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            {AI_FIELDS.map((f) => {
              const isUrl = f.name === 'ai_api_url';
              const isModel = f.name === 'ai_model';
              const preset = AI_PROVIDER_PRESETS.find((p) => p.key === aiProvider);
              const urlLocked = isUrl && aiProvider !== 'custom';
              return (
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
                      readOnly={urlLocked}
                      onChange={(e) => setForm((p) => ({ ...p, [f.name]: e.target.value }))}
                    />
                  )}
                  {urlLocked && <div className="text-11 text-muted-3 mt-1">Auto-filled for {preset.label} — switch to "Custom" to edit.</div>}
                  {isModel && preset?.models?.length > 0 && (
                    <div className="d-flex flex-wrap gap-1 mt-2">
                      {preset.models.map((m) => (
                        <button
                          type="button"
                          key={m}
                          className={`btn btn-sm rounded-crm-xs text-11 ${form.ai_model === m ? 'btn-crm' : 'btn-outline-secondary'}`}
                          onClick={() => setForm((p) => ({ ...p, ai_model: m }))}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
