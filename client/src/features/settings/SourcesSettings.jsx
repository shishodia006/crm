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

export default function SourcesSettings() {
  const toast = useToast();
  const { data, loading, reload } = useResource('/api/settings/sources');
  const sources = data?.sources ?? [];
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

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
              <input className="crm-input mb-3" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="d-flex flex-column gap-2">
                {filtered.map((s) => (
                  <button
                    key={s.id}
                    className={`crm-source-item ${selected?.id === s.id ? 'active' : ''}`}
                    onClick={() => selectSource(s)}
                  >
                    <div className="fw-semibold text-13">{s.name}</div>
                    <div className="text-11" style={{ opacity: 0.75 }}>{s.lead_count} lead{s.lead_count === 1 ? '' : 's'}</div>
                  </button>
                ))}
                {filtered.length === 0 && <p className="text-muted text-12 text-center py-3">No sources match.</p>}
              </div>
            </div>
          </div>
        </div>

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
