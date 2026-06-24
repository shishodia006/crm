import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';

/* ── Helpers ─────────────────────────────────────────── */
const Field = ({ label, name, type = 'text', value, onChange, readOnly, hint }) => (
  <div className="mb-3">
    <label className="crm-label">{label}</label>
    <input
      type={type}
      className="form-control crm-input"
      value={value ?? ''}
      readOnly={readOnly}
      onChange={readOnly ? undefined : (e) => onChange(name, e.target.value)}
    />
    {hint && <div className="form-text text-11">{hint}</div>}
  </div>
);

const Select = ({ label, name, value, options, onChange }) => (
  <div className="mb-3">
    <label className="crm-label">{label}</label>
    <select
      className="form-select crm-select"
      value={value ?? ''}
      onChange={(e) => onChange(name, e.target.value)}
    >
      {options.map(({ value: v, label: l }) => <option key={v} value={v}>{l}</option>)}
    </select>
  </div>
);

const Card = ({ icon, title, badge, children }) => (
  <div className="card crm-int-card mb-4">
    <div className="card-body p-4">
      {(icon || title) && (
        <div className="d-flex align-items-center gap-2 mb-4">
          {icon && <i className={`bi bi-${icon} crm-int-icon`} />}
          <h6 className="crm-int-card-title mb-0">{title}</h6>
          {badge && <span className="badge badge-source badge-crm ms-1">{badge}</span>}
        </div>
      )}
      {children}
    </div>
  </div>
);

function TestAnantya({ apiKey }) {
  const toast = useToast();
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null); // null | 'ok' | 'fail'

  const test = async () => {
    if (!apiKey) { toast('Enter your API key first.', 'warning'); return; }
    setTesting(true);
    setStatus(null);
    try {
      const res = await api.get(`/api/templates/wa-sync?key=${encodeURIComponent(apiKey)}`);
      const count = res?.total ?? (Array.isArray(res?.templates) ? res.templates.length : 0);
      setStatus('ok');
      toast(`Connected! ${count} template(s) found on Anantya.`, 'success');
    } catch (err) {
      setStatus('fail');
      toast(`Connection failed: ${err.message}`, 'danger');
    } finally {
      setTesting(false);
    }
  };

  return (
    <button type="button" className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" onClick={test} disabled={testing}>
      {testing
        ? <><span className="spinner-border spinner-border-sm" />Testing…</>
        : status === 'ok'
          ? <><i className="bi bi-check-circle-fill text-success" />Connected</>
          : status === 'fail'
            ? <><i className="bi bi-x-circle-fill text-danger" />Failed — Retry</>
            : <><i className="bi bi-wifi" />Test Connection</>
      }
    </button>
  );
}

const SaveBtn = ({ saving, label = 'Save', onClick }) => (
  <button type="button" className="btn btn-crm" disabled={saving} onClick={onClick}>
    {saving ? <><span className="spinner-border spinner-border-sm me-1" />Saving…</> : label}
  </button>
);

const APP_URL = (import.meta.env.VITE_API_BASE || 'http://localhost:8090');

function IntegrationAccounts() {
  const toast = useToast();
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({ name: '', provider: 'meta', channel: 'whatsapp', external_account_id: '', webhook_secret: '', config_text: '{}' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/settings/integration-accounts');
      setAccounts(data?.accounts ?? []);
    } catch (error) { toast(error.message || 'Could not load integration accounts.', 'danger'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      let config = {};
      try { config = JSON.parse(form.config_text || '{}'); } catch { toast('Account configuration must be valid JSON.', 'danger'); setBusy(false); return; }
      await api.post('/api/settings/integration-accounts', { ...form, config });
      setForm({ name: '', provider: 'meta', channel: 'whatsapp', external_account_id: '', webhook_secret: '', config_text: '{}' });
      await load();
      toast('Integration account created.', 'success');
    } catch (error) { toast(error.message || 'Could not save account.', 'danger'); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Remove this integration account?')) return;
    try {
      await api.delete(`/api/settings/integration-accounts/${id}`);
      setAccounts((items) => items.filter((item) => item.id !== id));
      toast('Integration account removed.', 'success');
    } catch (error) { toast(error.message || 'Could not remove account.', 'danger'); }
  };

  return (
    <Card icon="collection-fill" title="Connected Accounts" badge="Multiple per company">
      <p className="text-muted text-12 mb-3">Add each WhatsApp, email, SMS or lead-source account separately. Every account gets an isolated webhook endpoint.</p>
      <form className="row g-2 align-items-end mb-3" onSubmit={save}>
        <div className="col-md-3"><Field label="Account name" name="name" value={form.name} onChange={(n, v) => setForm((p) => ({ ...p, [n]: v }))} /></div>
        <div className="col-md-2"><Field label="Provider" name="provider" value={form.provider} onChange={(n, v) => setForm((p) => ({ ...p, [n]: v }))} /></div>
        <div className="col-md-2"><Select label="Channel" name="channel" value={form.channel} onChange={(n, v) => setForm((p) => ({ ...p, [n]: v }))} options={[{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'Email' }, { value: 'rcs', label: 'RCS' }, { value: 'sms', label: 'SMS' }, { value: 'lead_source', label: 'Lead source' }]} /></div>
        <div className="col-md-2"><Field label="External account ID" name="external_account_id" value={form.external_account_id} onChange={(n, v) => setForm((p) => ({ ...p, [n]: v }))} /></div>
        <div className="col-md-2"><Field label="Webhook secret" name="webhook_secret" type="password" value={form.webhook_secret} onChange={(n, v) => setForm((p) => ({ ...p, [n]: v }))} /></div>
        <div className="col-md-2"><label className="crm-label">Account config (JSON)</label><textarea className="form-control crm-input" rows="2" value={form.config_text} onChange={(e) => setForm((p) => ({ ...p, config_text: e.target.value }))} placeholder='{"api_key":"..."}' /></div>
        <div className="col-md-1"><button className="btn btn-crm w-100" disabled={busy}>{busy ? '…' : 'Add'}</button></div>
      </form>
      {accounts.length === 0 ? <div className="text-muted text-12">No separate integration accounts added yet.</div> : (
        <div className="table-responsive"><table className="table table-sm align-middle mb-0 text-12"><thead><tr><th>Account</th><th>Provider</th><th>Webhook URL</th><th /></tr></thead><tbody>{accounts.map((account) => (
          <tr key={account.id}><td><strong>{account.name}</strong><div className="text-muted">{account.channel}</div></td><td>{account.provider}</td><td><code className="text-break">{`${APP_URL}/webhook/${account.provider}/${account.webhook_key}`}</code></td><td><button type="button" className="btn btn-outline-danger btn-sm" onClick={() => remove(account.id)}><i className="bi bi-trash" /></button></td></tr>
        ))}</tbody></table></div>
      )}
    </Card>
  );
}

/* ── Tabs ─────────────────────────────────────────────── */
const TABS = [
  { id: 'email',     icon: 'envelope-fill',  label: 'Email' },
  { id: 'whatsapp',  icon: 'whatsapp',        label: 'WhatsApp' },
  { id: 'sms',       icon: 'phone-fill',      label: 'SMS' },
  { id: 'rcs',       icon: 'chat-dots-fill',  label: 'RCS' },
  { id: 'leads_api', icon: 'funnel-fill',     label: 'Lead Sources API' },
];

/* ── Main Component ───────────────────────────────────── */
export default function IntegrationsSettings() {
  const toast = useToast();
  const [tab, setTab] = useState('email');
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/settings/integrations')
      .then((d) => setForm(d?.settings ?? d ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = useCallback((name, value) => setForm((p) => ({ ...p, [name]: value })), []);

  const save = async (fields) => {
    setSaving(true);
    try {
      const payload = {};
      fields.forEach((k) => { payload[k] = form[k] ?? ''; });
      await api.post('/api/settings/integrations', payload);
      toast('Saved successfully.', 'success');
    } catch (err) {
      toast(err.message || 'Save failed.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBox />;

  return (
    <div>
      <h5 className="fw-bold mb-4 text-brand">Integrations</h5>

      <IntegrationAccounts />

      {/* Tab Strip */}
      <div className="crm-tabs mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`crm-tab${tab === t.id ? ' active' : ''}`}
          >
            <i className={`bi bi-${t.icon}`} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── EMAIL ─────────────────────────────────────── */}
      {tab === 'email' && (
        <>
          <Card icon="envelope-fill" title="Active Email Provider">
            <div className="row g-3">
              <div className="col-md-4">
                <Select
                  label="Provider"
                  name="email_provider"
                  value={form.email_provider || 'smtp'}
                  onChange={set}
                  options={[
                    { value: 'smtp',          label: 'SMTP (Custom)' },
                    { value: 'sendgrid',      label: 'SendGrid' },
                    { value: 'mailgun',       label: 'Mailgun' },
                    { value: 'ses',           label: 'Amazon SES' },
                    { value: 'gmail_oauth',   label: 'Gmail OAuth' },
                    { value: 'outlook_oauth', label: 'Outlook OAuth' },
                  ]}
                />
              </div>
              <div className="col-md-4">
                <Field label="From Name" name="smtp_from_name" value={form.smtp_from_name} onChange={set} />
              </div>
              <div className="col-md-4">
                <Field label="From Email" name="smtp_from" value={form.smtp_from} onChange={set} />
              </div>
            </div>
          </Card>

          {(!form.email_provider || form.email_provider === 'smtp') && (
            <Card icon="hdd-network-fill" title="SMTP Configuration">
              <div className="row g-3">
                <div className="col-md-5">
                  <Field label="Host" name="smtp_host" value={form.smtp_host} onChange={set} />
                </div>
                <div className="col-md-2">
                  <Field label="Port" name="smtp_port" type="number" value={form.smtp_port} onChange={set} />
                </div>
                <div className="col-md-5">
                  <Field label="Username" name="smtp_user" value={form.smtp_user} onChange={set} />
                </div>
                <div className="col-md-12">
                  <Field label="Password" name="smtp_pass" type="password" value={form.smtp_pass} onChange={set}
                    hint="For Gmail SMTP: use App Password (2FA must be enabled). Port 587 (TLS) or 465 (SSL)." />
                </div>
              </div>
              <SaveBtn saving={saving} label="Save SMTP"
                onClick={() => save(['email_provider','smtp_from_name','smtp_from','smtp_host','smtp_port','smtp_user','smtp_pass'])} />
            </Card>
          )}

          {form.email_provider === 'sendgrid' && (
            <Card icon="send-fill" title="SendGrid Configuration">
              <Field label="API Key" name="sendgrid_key" type="password" value={form.sendgrid_key} onChange={set} />
              <SaveBtn saving={saving} label="Save SendGrid"
                onClick={() => save(['email_provider','smtp_from_name','smtp_from','sendgrid_key'])} />
            </Card>
          )}

          {form.email_provider === 'mailgun' && (
            <Card icon="mailbox-fill" title="Mailgun Configuration">
              <div className="row g-3">
                <div className="col-md-6">
                  <Field label="API Key" name="mailgun_key" type="password" value={form.mailgun_key} onChange={set} />
                </div>
                <div className="col-md-6">
                  <Field label="Domain" name="mailgun_domain" value={form.mailgun_domain} onChange={set} />
                </div>
              </div>
              <SaveBtn saving={saving} label="Save Mailgun"
                onClick={() => save(['email_provider','smtp_from_name','smtp_from','mailgun_key','mailgun_domain'])} />
            </Card>
          )}
        </>
      )}

      {/* ── WHATSAPP ──────────────────────────────────── */}
      {tab === 'whatsapp' && (
        <>
          <Card icon="whatsapp" title="Active WhatsApp Provider">
            <div className="d-flex align-items-end gap-3">
              <div className="crm-int-provider-wrap">
                <Select
                  label="Provider"
                  name="wa_provider"
                  value={form.wa_provider || 'meta'}
                  onChange={set}
                  options={[
                    { value: 'meta',    label: 'Meta Cloud API (Direct)' },
                    { value: 'gupshup', label: 'Gupshup' },
                    { value: 'anantya', label: 'Anantya.ai' },
                  ]}
                />
              </div>
              <div className="mb-3">
                <SaveBtn saving={saving} label="Set Provider" onClick={() => save(['wa_provider'])} />
              </div>
            </div>
          </Card>

          {(!form.wa_provider || form.wa_provider === 'meta') && (
            <Card icon="meta" title="Meta Cloud API Configuration">
              <div className="row g-3">
                <div className="col-md-6">
                  <Field label="Access Token" name="wa_meta_token" type="password" value={form.wa_meta_token} onChange={set} />
                </div>
                <div className="col-md-6">
                  <Field label="Phone Number ID" name="wa_meta_phone_id" value={form.wa_meta_phone_id} onChange={set} />
                </div>
                <div className="col-md-12">
                  <Field label="Webhook URL (point in Meta Dashboard)" name="_wa_webhook"
                    value={`${APP_URL}/webhook/whatsapp`} readOnly />
                </div>
              </div>
              <SaveBtn saving={saving} label="Save Meta Config"
                onClick={() => save(['wa_provider','wa_meta_token','wa_meta_phone_id'])} />
            </Card>
          )}

          {form.wa_provider === 'gupshup' && (
            <Card icon="chat-left-text-fill" title="Gupshup Configuration">
              <div className="row g-3">
                <div className="col-md-6">
                  <Field label="API Key" name="wa_gupshup_api_key" type="password" value={form.wa_gupshup_api_key} onChange={set} />
                </div>
                <div className="col-md-6">
                  <Field label="Source Number" name="wa_gupshup_src_number" value={form.wa_gupshup_src_number} onChange={set} />
                </div>
              </div>
              <SaveBtn saving={saving} label="Save Gupshup"
                onClick={() => save(['wa_provider','wa_gupshup_api_key','wa_gupshup_src_number'])} />
            </Card>
          )}

          {form.wa_provider === 'anantya' && (
            <Card icon="stars" title="Anantya.ai Configuration">
              <Field label="API Key" name="wa_anantya_api_key" type="password" value={form.wa_anantya_api_key} onChange={set}
                hint="Get your API key from Anantya dashboard." />
              <div className="d-flex align-items-center gap-3">
                <SaveBtn saving={saving} label="Save Anantya Config"
                  onClick={() => save(['wa_provider','wa_anantya_api_key'])} />
                <TestAnantya apiKey={form.wa_anantya_api_key} />
              </div>
            </Card>
          )}
        </>
      )}

      {/* ── SMS ───────────────────────────────────────── */}
      {tab === 'sms' && (
        <Card icon="phone-fill" title="SMS Provider">
          <div className="row g-3">
            <div className="col-md-4">
              <Select
                label="Provider"
                name="sms_provider"
                value={form.sms_provider || 'msg91'}
                onChange={set}
                options={[
                  { value: 'msg91',     label: 'MSG91' },
                  { value: 'twilio',    label: 'Twilio' },
                  { value: 'fast2sms',  label: 'Fast2SMS' },
                  { value: 'textlocal', label: 'TextLocal' },
                ]}
              />
            </div>
            <div className="col-md-4">
              <Field label="API Key / Auth Token" name="sms_api_key" type="password" value={form.sms_api_key} onChange={set} />
            </div>
            <div className="col-md-4">
              <Field label="Sender ID / From" name="sms_sender" value={form.sms_sender} onChange={set} />
            </div>
          </div>
          <SaveBtn saving={saving} label="Save SMS Config"
            onClick={() => save(['sms_provider','sms_api_key','sms_sender'])} />
        </Card>
      )}

      {/* ── RCS ───────────────────────────────────────── */}
      {tab === 'rcs' && (
        <Card icon="chat-dots-fill" title="RCS via Anantya.ai">
          <div className="alert py-2 px-3 text-12 mb-3"
            style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
            <i className="bi bi-info-circle me-1" />
            Anantya supports both <strong>WhatsApp</strong> and <strong>RCS</strong> using the same API key.
            Configure your key in the <strong>WhatsApp → Anantya</strong> tab.
          </div>
        </Card>
      )}

      {/* ── LEAD SOURCES API ──────────────────────────── */}
      {tab === 'leads_api' && (
        <>
          <div className="row g-4">
            <div className="col-md-6">
              <Card icon="building" title="IndiaMart" badge="REST API">
                <Field label="API Key (CRM Key)" name="indiamart_key" type="password" value={form.indiamart_key} onChange={set} />
                <Field label="Webhook URL" name="_im_webhook" value={`${APP_URL}/webhook/indiamart`} readOnly />
                <Field label="API Ingest URL" name="_im_ingest" value={`${APP_URL}/ingest/indiamart`} readOnly />
              </Card>
            </div>
            <div className="col-md-6">
              <Card icon="shop" title="TradeIndia" badge="REST API">
                <Field label="API Key" name="tradeindia_key" type="password" value={form.tradeindia_key} onChange={set} />
                <Field label="User ID" name="tradeindia_user" value={form.tradeindia_user} onChange={set} />
                <Field label="Webhook URL" name="_ti_webhook" value={`${APP_URL}/webhook/tradeindia`} readOnly />
              </Card>
            </div>
            <div className="col-md-6">
              <Card icon="facebook" title="Meta / Facebook Lead Ads">
                <Field label="Page Access Token" name="meta_ads_token" type="password" value={form.meta_ads_token} onChange={set} />
                <Field label="App Secret (Webhook Verification)" name="meta_ads_secret" type="password" value={form.meta_ads_secret} onChange={set} />
                <Field label="Webhook URL" name="_meta_webhook" value={`${APP_URL}/webhook/meta`} readOnly />
                <Field label="Verify Token" name="meta_verify_token" value={form.meta_verify_token} onChange={set}
                  hint="Set this same token in Meta App Dashboard → Webhooks → Verify Token" />
              </Card>
            </div>
            <div className="col-md-6">
              <Card icon="google" title="Google Ads / GLS">
                <Field label="Developer Token" name="google_ads_token" type="password" value={form.google_ads_token} onChange={set} />
                <Field label="Customer ID" name="google_ads_customer_id" value={form.google_ads_customer_id} onChange={set}
                  hint="Format: xxx-xxx-xxxx" />
                <Field label="API Ingest URL" name="_gads_ingest" value={`${APP_URL}/ingest/google`} readOnly />
              </Card>
            </div>
            <div className="col-md-6">
              <Card icon="linkedin" title="LinkedIn Lead Gen">
                <Field label="Access Token" name="linkedin_token" type="password" value={form.linkedin_token} onChange={set} />
                <Field label="Organization URN" name="linkedin_org_urn" value={form.linkedin_org_urn} onChange={set}
                  hint="e.g. urn:li:organization:12345" />
                <Field label="Webhook URL" name="_li_webhook" value={`${APP_URL}/webhook/linkedin`} readOnly />
              </Card>
            </div>
            <div className="col-md-6">
              <Card icon="telephone-fill" title="JustDial">
                <Field label="API Key" name="justdial_api_key" type="password" value={form.justdial_api_key} onChange={set} />
                <Field label="Login" name="justdial_login" value={form.justdial_login} onChange={set} />
                <Field label="Webhook URL" name="_jd_webhook" value={`${APP_URL}/webhook/justdial`} readOnly />
              </Card>
            </div>
          </div>
          <SaveBtn saving={saving} label="Save Lead Source API Keys"
            onClick={() => save([
              'indiamart_key',
              'tradeindia_key','tradeindia_user',
              'meta_ads_token','meta_ads_secret','meta_verify_token',
              'google_ads_token','google_ads_customer_id',
              'linkedin_token','linkedin_org_urn',
              'justdial_api_key','justdial_login',
            ])} />
        </>
      )}
    </div>
  );
}
