import { useState, useEffect } from 'react';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import PasswordInput from '../../components/common/PasswordInput.jsx';

const CHANNELS = [
  { key: 'email', label: 'Email' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'sms', label: 'SMS' },
  { key: 'rcs', label: 'RCS' },
  { key: 'call', label: 'Voice' },
];

const PROVIDER_OPTIONS = {
  email: [
    { value: 'smtp', label: 'SMTP (Custom)' },
    { value: 'sendgrid', label: 'SendGrid' },
    { value: 'mailgun', label: 'Mailgun' },
  ],
  whatsapp: [
    { value: 'meta', label: 'Meta Cloud API' },
    { value: 'gupshup', label: 'Gupshup' },
    { value: 'anantya', label: 'Anantya.ai' },
  ],
  sms: [
    { value: 'mshastra', label: 'MShastra' },
    { value: 'msg91', label: 'MSG91' },
    { value: 'twilio', label: 'Twilio' },
    { value: 'fast2sms', label: 'Fast2SMS' },
    { value: 'textlocal', label: 'TextLocal' },
  ],
  rcs: [{ value: 'anantya', label: 'Anantya.ai' }],
  call: [{ value: 'twilio', label: 'Twilio' }],
};

const PROVIDER_FIELDS = {
  'email:smtp': [
    { name: 'smtp_host', label: 'Host' },
    { name: 'smtp_port', label: 'Port', type: 'number' },
    { name: 'smtp_user', label: 'Username' },
    { name: 'smtp_pass', label: 'Password', type: 'password' },
  ],
  'email:sendgrid': [{ name: 'sendgrid_key', label: 'API Key', type: 'password' }],
  'email:mailgun': [
    { name: 'mailgun_key', label: 'API Key', type: 'password' },
    { name: 'mailgun_domain', label: 'Domain' },
  ],
  'whatsapp:meta': [
    { name: 'wa_meta_token', label: 'Access Token', type: 'password' },
    { name: 'wa_meta_phone_id', label: 'Phone Number ID' },
  ],
  'whatsapp:gupshup': [
    { name: 'wa_gupshup_api_key', label: 'API Key', type: 'password' },
    { name: 'wa_gupshup_src_number', label: 'Source Number' },
  ],
  'whatsapp:anantya': [{ name: 'wa_anantya_api_key', label: 'API Key', type: 'password' }],
  'sms:mshastra': [
    { name: 'sms_mshastra_user', label: 'Username' },
    { name: 'sms_mshastra_pwd', label: 'Password', type: 'password' },
    { name: 'sms_mshastra_sender', label: 'Sender ID' },
  ],
  'rcs:anantya': [{ name: 'rcs_api_key', label: 'API Key', type: 'password' }],
  'call:twilio': [
    { name: 'twilio_account_sid', label: 'Account SID' },
    { name: 'twilio_auth_token', label: 'Auth Token', type: 'password' },
    { name: 'twilio_phone_number', label: 'Twilio Phone Number (E.164, e.g. +14155551234)' },
  ],
};
const GENERIC_SMS_FIELDS = [
  { name: 'sms_api_url', label: 'API URL' },
  { name: 'sms_api_key', label: 'API Key', type: 'password' },
  { name: 'sms_sender', label: 'Sender ID' },
];

function fieldsFor(channel, provider) {
  if (channel === 'sms' && provider !== 'mshastra') return GENERIC_SMS_FIELDS;
  return PROVIDER_FIELDS[`${channel}:${provider}`] || [];
}
function providerKeyFor(channel) {
  return channel === 'email' ? 'email_provider' : channel === 'whatsapp' ? 'wa_provider' : channel === 'sms' ? 'sms_provider' : null;
}

function MetricsCard({ channel }) {
  const [metrics, setMetrics] = useState(null);
  useEffect(() => {
    setMetrics(null);
    api.get(`/api/settings/channel-metrics?channel=${channel}`).then(setMetrics).catch(() => setMetrics(null));
  }, [channel]);

  const rows = [
    ['Sent', metrics?.sent?.toLocaleString?.() ?? metrics?.sent],
    ['Delivered', metrics?.delivered?.toLocaleString?.() ?? metrics?.delivered],
    ['Delivery Rate', metrics ? `${metrics.delivery_rate}%` : null],
    ['Open Rate', metrics ? `${metrics.open_rate}%` : null],
    ['Click Rate', metrics ? `${metrics.click_rate}%` : null],
  ];

  return (
    <div className="card crm-card h-100">
      <div className="card-body p-4">
        <div className="text-11 fw-bold text-uppercase ls-wide text-muted-3 mb-3">Performance Metrics</div>
        {!metrics ? <LoadingBox /> : rows.map(([label, value]) => (
          <div key={label} className="d-flex justify-content-between align-items-center py-2 border-bottom">
            <span className="text-13 text-muted-2">{label}</span>
            <span className="fw-bold text-14">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ChannelsPage() {
  const toast = useToast();
  const [channel, setChannel] = useState('email');
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/settings/integrations').then((d) => setSettings(d?.settings ?? {})).finally(() => setLoading(false));
  }, []);

  const providerKey = providerKeyFor(channel);
  const provider = (providerKey ? settings[providerKey] : null) || PROVIDER_OPTIONS[channel][0].value;
  const fields = fieldsFor(channel, provider);

  const setField = (name, value) => setSettings((p) => ({ ...p, [name]: value }));

  const handleConfigure = async () => {
    setSaving(true);
    try {
      const payload = { ...(providerKey ? { [providerKey]: provider } : {}) };
      fields.forEach((f) => { payload[f.name] = settings[f.name] ?? ''; });
      await api.post('/api/settings/integrations', payload);
      toast(`${CHANNELS.find((c) => c.key === channel).label} channel configured.`, 'success');
    } catch (err) { toast(err.message, 'danger'); }
    finally { setSaving(false); }
  };

  if (loading) return <LoadingBox />;

  return (
    <div>
      <div className="mb-1">
        <h5 className="fw-bold mb-0 text-brand">Channels</h5>
        <div className="text-muted text-12">How you reach leads and customers — email, WhatsApp, SMS, RCS, Voice.</div>
      </div>

      <div className="row g-3 mt-3">
        <div className="col-lg-7">
          <div className="card crm-card h-100">
            <div className="card-body p-4">
              <div className="text-11 fw-bold text-uppercase ls-wide text-muted-3 mb-3">Channel Selection</div>
              <div className="crm-tabs mb-3">
                {CHANNELS.map((c) => (
                  <button key={c.key} className={`crm-tab${channel === c.key ? ' active' : ''}`} onClick={() => setChannel(c.key)}>{c.label}</button>
                ))}
              </div>

              {providerKey && (
                <div className="mb-3">
                  <label className="crm-label">Provider</label>
                  <select className="crm-select w-100" value={provider} onChange={(e) => setField(providerKey, e.target.value)}>
                    {PROVIDER_OPTIONS[channel].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}

              {fields.map((f) => (
                <div className="mb-3" key={f.name}>
                  <label className="crm-label">{f.label}</label>
                  {f.type === 'password' ? (
                    <PasswordInput className="crm-input" value={settings[f.name] ?? ''} onChange={(e) => setField(f.name, e.target.value)} />
                  ) : (
                    <input type={f.type || 'text'} className="crm-input" value={settings[f.name] ?? ''} onChange={(e) => setField(f.name, e.target.value)} />
                  )}
                </div>
              ))}

              {channel === 'call' && (
                <div className="text-11 text-muted-2 mb-3">
                  After saving, open this number in your Twilio Console → Phone Numbers → Voice Configuration →
                  "A call comes in" → Webhook, and set it to <code>{`${window.location.origin}/webhook/twilio/voice/inbound`}</code> (HTTP POST) —
                  this one-time step isn't done automatically.
                </div>
              )}

              <button className="btn-crm w-100 justify-content-center mt-2" disabled={saving} onClick={handleConfigure}>
                {saving ? 'Saving…' : 'Configure'}
              </button>
            </div>
          </div>
        </div>

        <div className="col-lg-5">
          <MetricsCard channel={channel} />
        </div>
      </div>
    </div>
  );
}
