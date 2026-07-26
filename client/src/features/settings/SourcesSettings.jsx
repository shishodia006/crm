import { useState, useMemo } from 'react';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import PasswordInput from '../../components/common/PasswordInput.jsx';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import { timeAgo } from '../../utils/formatters.js';

const STATUS_BADGE = { healthy: 'live', warning: 'waiting', error: 'overdue', new: 'draft' };
const STATUS_LABEL = { healthy: 'Healthy', warning: 'Needs Attention', error: 'Failing', new: 'No Data Yet' };
const APP_URL = (import.meta.env.VITE_API_BASE || 'http://localhost:8090');

// These slugs each have a real, dedicated integration (OAuth/token connect,
// working sync and/or webhook) under Settings → Integrations → Lead Sources
// API — that page's per-source webhook key is what's actually checked at
// request time, not the generic integration_accounts-based one this page
// would otherwise create. Showing the old API Key/Webhook form for them here
// would silently produce a URL that 404s the moment it's used for real.
const MANAGED_ELSEWHERE = new Set([
  'google_sheets', 'shopify', 'hubspot', 'salesforce', 'mailchimp', 'zendesk',
  'indiamart', 'tradeindia', 'meta', 'google_ads', 'linkedin', 'justdial',
  'apollo', 'lusha', 'zoominfo', 'bombora', 'g2_intent',
]);

function buildWebsiteEmbedSnippet(slug) {
  const captureUrl = `${APP_URL}/capture/${slug}`;
  return `<form id="dd-lead-form">
  <input type="text" name="name" placeholder="Your Name" required>
  <input type="email" name="email" placeholder="Email">
  <input type="tel" name="mobile" placeholder="Mobile Number">
  <textarea name="product_interest" placeholder="What do you need?"></textarea>
  <button type="submit">Submit</button>
</form>
<script>
(function () {
  var form = document.getElementById('dd-lead-form');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var data = Object.fromEntries(new FormData(form));
    data.source_ref = window.location.href; // tells you exactly which page/popup this came from
    fetch('${captureUrl}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.success) {
        form.innerHTML = '<p>Thank you! We will contact you soon.</p>';
      } else {
        alert((res && res.message) || 'Something went wrong, please try again.');
      }
    }).catch(function () {
      alert('Something went wrong, please try again.');
    });
  });
})();
</script>`;
}

// Same snippet works for a popup, a landing page, or a contact form — it's just
// pasted onto whatever page it's on, and window.location.href in the snippet
// is what tells them apart afterwards (shown as "Page URL" on the lead).
function WebsiteEmbedSnippet({ slug, toast }) {
  const snippet = buildWebsiteEmbedSnippet(slug);
  const copy = () => {
    navigator.clipboard.writeText(snippet);
    toast('Snippet copied — paste it into your popup, landing page, or contact form.', 'success');
  };
  return (
    <div className="mb-3">
      <label className="crm-label">Embed Snippet</label>
      <div className="form-text text-11 mb-2">
        Paste this into any page — popup, landing page, or contact form. Every submission becomes a lead here, and
        the exact page URL it came from is recorded automatically (visible on the lead as "Page URL").
      </div>
      <pre className="crm-code-block">{snippet}</pre>
      <button type="button" className="btn btn-outline-secondary w-100" onClick={copy}>
        <i className="bi bi-clipboard me-1" />Copy Snippet
      </button>
    </div>
  );
}

export default function SourcesSettings() {
  const toast = useToast();
  const { data, loading, reload } = useResource('/api/settings/sources');
  const sources = data?.sources ?? [];
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const filtered = useMemo(
    () => sources.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())),
    [sources, search]
  );
  const selected = sources.find((s) => s.id === (selectedId ?? filtered[0]?.id)) ?? filtered[0];

  const selectSource = (s) => { setSelectedId(s.id); setApiKey(s.api_key || ''); };
  const currentApiKey = selectedId === selected?.id && apiKey !== undefined ? apiKey : (selected?.api_key || '');

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await api.post(`/api/settings/sources/${selected.id}/config`, { api_key: currentApiKey });
      toast('Source configured.', 'success');
      reload();
    } catch (err) { toast(err.message, 'danger'); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    if (!selected) return;
    setTesting(true);
    try {
      const r = await api.post(`/api/settings/sources/${selected.id}/test`, {});
      toast(r.message || 'Connected.', 'success');
    } catch (err) { toast(err.message, 'danger'); }
    finally { setTesting(false); }
  };

  if (loading) return <LoadingBox />;

  return (
    <div>
      <div className="mb-1">
        <h5 className="fw-bold mb-0 text-brand">Sources</h5>
        <div className="text-muted text-12">Where your leads come from, and how healthy each feed is.</div>
      </div>

      <div className="row g-3 mt-3">
        <div className="col-lg-4">
          <div className="card crm-card h-100">
            <div className="card-body p-4">
              <div className="text-11 fw-bold text-uppercase ls-wide text-muted-3 mb-3">Lead Sources</div>
              <button type="button" className="crm-select-trigger w-100" onClick={() => setPickerOpen(true)}>
                <span>{selected ? `${selected.name} — ${selected.lead_count} lead${selected.lead_count === 1 ? '' : 's'}` : 'Select a source'}</span>
                <i className="bi bi-chevron-down text-muted-3" />
              </button>
            </div>
          </div>
        </div>

        {pickerOpen && (
          <div className="crm-modal-backdrop" onClick={() => setPickerOpen(false)}>
            <div className="crm-modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
              <div className="crm-modal-header">
                <div className="fw-bold text-15">Select Lead Source</div>
                <button type="button" className="crm-modal-close" onClick={() => setPickerOpen(false)}>
                  <i className="bi bi-x-lg" />
                </button>
              </div>
              <div className="p-3">
                <input
                  autoFocus
                  className="crm-input mb-2"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                  {filtered.length === 0 && <div className="text-muted text-13 text-center py-3">No sources match</div>}
                  {filtered.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`crm-source-picker-row${selected?.id === s.id ? ' active' : ''}`}
                      onClick={() => { selectSource(s); setPickerOpen(false); }}
                    >
                      <span>{s.name}</span>
                      <span className={selected?.id === s.id ? '' : 'text-muted-3'}>{s.lead_count} lead{s.lead_count === 1 ? '' : 's'}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {selected && (
          <>
            <div className="col-lg-4">
              <div className="card crm-card h-100">
                <div className="card-body p-4">
                  <div className="text-11 fw-bold text-uppercase ls-wide text-muted-3 mb-3">Configuration</div>
                  <div className="mb-3">
                    <label className="crm-label">Source Name</label>
                    <input className="crm-input" value={selected.name} readOnly />
                  </div>
                  {selected.category === 'website' ? (
                    <WebsiteEmbedSnippet slug={selected.slug} toast={toast} />
                  ) : MANAGED_ELSEWHERE.has(selected.slug) ? (
                    <>
                      <p className="text-13 text-muted-2 mb-2">
                        {selected.name} has a dedicated setup (API key/OAuth, real sync, and/or real-time webhook) under{' '}
                        <strong>Settings → Integrations → Lead Sources API</strong>. Configure and connect it there —
                        this generic form isn't wired to that connection.
                      </p>
                      <a href="/settings/integrations" className="btn btn-outline-secondary w-100 justify-content-center d-flex align-items-center gap-1">
                        Go to Lead Sources API settings
                      </a>
                    </>
                  ) : (
                    <>
                      <div className="mb-3">
                        <label className="crm-label">API Key</label>
                        <PasswordInput className="crm-input" value={currentApiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Not configured" />
                        <div className="form-text text-11">Used to authenticate leads pushed from {selected.name}.</div>
                      </div>
                      <div className="mb-3">
                        <label className="crm-label">Webhook URL</label>
                        <input className="crm-input text-11" readOnly
                          value={selected.webhook_key ? `${APP_URL}/webhook/${selected.slug}/${selected.webhook_key}` : `${APP_URL}/ingest/${selected.slug}`} />
                      </div>
                      <button className="btn-crm w-100 justify-content-center mb-2" disabled={saving} onClick={handleSave}>
                        {saving ? 'Saving…' : 'Save Configuration'}
                      </button>
                      <button className="btn btn-outline-secondary w-100" disabled={testing} onClick={handleTest}>
                        {testing ? 'Testing…' : 'Test Connection'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="col-lg-4">
              <div className="card crm-card h-100">
                <div className="card-body p-4">
                  <div className="text-11 fw-bold text-uppercase ls-wide text-muted-3 mb-3">Analytics &amp; Health</div>
                  <div className="row g-2 mb-3">
                    <div className="col-6">
                      <div className="crm-source-stat-box">
                        <div className="fw-bold text-18">{selected.lead_count}</div>
                        <div className="text-11 text-muted-3">Total Leads</div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="crm-source-stat-box">
                        <div className="fw-bold text-18">{selected.leads_this_month ?? 0}</div>
                        <div className="text-11 text-muted-3">This Month</div>
                      </div>
                    </div>
                  </div>
                  <div className="d-flex justify-content-between align-items-center py-2 border-bottom">
                    <span className="text-13 text-muted-2">Status</span>
                    <span className={`badge badge-crm badge-${STATUS_BADGE[selected.status]}`}>{STATUS_LABEL[selected.status].toUpperCase()}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center py-2 border-bottom">
                    <span className="text-13 text-muted-2">Last Sync</span>
                    <span className="fw-bold text-14">{selected.last_lead_at ? `${timeAgo(selected.last_lead_at)} ago` : '—'}</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center py-2">
                    <span className="text-13 text-muted-2">Success Rate</span>
                    <span className="fw-bold text-14">{selected.success_rate == null ? '—' : `${selected.success_rate}%`}</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
