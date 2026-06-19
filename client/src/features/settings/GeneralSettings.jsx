import { useState, useEffect } from 'react';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';

const FIELDS = [
  { name: 'app_name', label: 'Application Name' },
  { name: 'timezone', label: 'Timezone', placeholder: 'Asia/Kolkata' },
  { name: 'currency', label: 'Currency', placeholder: 'INR' },
  { name: 'smtp_host', label: 'SMTP Host' },
  { name: 'smtp_port', label: 'SMTP Port', type: 'number' },
  { name: 'smtp_user', label: 'SMTP Username' },
  { name: 'smtp_pass', label: 'SMTP Password', type: 'password' },
  { name: 'smtp_from', label: 'From Email' },
  { name: 'smtp_from_name', label: 'From Name' },
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
    <div className="card border-0 shadow-sm">
      <div className="card-body p-4">
        <h6 className="fw-semibold mb-4">General Settings</h6>
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
          <div className="mt-4">
            <button className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
