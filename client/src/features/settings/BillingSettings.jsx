import { useState, useEffect } from 'react';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <div className="crm-toggle-row">
      <div>
        <div className="fw-semibold text-14">{label}</div>
        <div className="text-12 text-muted-3">{hint}</div>
      </div>
      <button type="button" className={`crm-toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
        <span className="crm-toggle-knob" />
      </button>
    </div>
  );
}

export default function BillingSettings() {
  const toast = useToast();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/settings').then((d) => setSettings(d?.settings ?? {})).finally(() => setLoading(false));
  }, []);

  const toggle = async (key, value) => {
    setSettings((p) => ({ ...p, [key]: value ? '1' : '0' }));
    try { await api.post('/api/settings', { [key]: value ? '1' : '0' }); toast('Saved.', 'success'); }
    catch (err) { toast(err.message, 'danger'); }
  };

  if (loading) return <LoadingBox />;

  return (
    <div className="card crm-card">
      <div className="card-body p-4">
        <h6 className="fw-bold mb-1 text-brand">Billing</h6>
        <p className="text-muted text-12 mb-3">Plan, usage, and invoices.</p>
        <hr className="mb-3" />

        <div className="crm-insight-banner info mb-3">
          <i className="bi bi-info-circle-fill" />
          No billing provider is connected yet — plan, seats, and payment method will show here once one is set up.
        </div>

        <ToggleRow
          label="Email notifications"
          hint="Get a copy of every invoice by email."
          checked={settings.billing_email_notifications === '1'}
          onChange={(v) => toggle('billing_email_notifications', v)}
        />
        <ToggleRow
          label="Auto-renew"
          hint="Plan renews automatically each month, once billing is connected."
          checked={settings.billing_auto_renew === '1'}
          onChange={(v) => toggle('billing_auto_renew', v)}
        />
      </div>
    </div>
  );
}
