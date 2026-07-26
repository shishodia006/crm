import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import { useConfirm } from '../../hooks/useConfirm.js';
import { timeAgo } from '../../utils/formatters.js';

const OAUTH_ONLY_SLUGS = ['google_sheets', 'salesforce'];
const SYNC_SUMMARY_SLUGS = { google_sheets: 'rows', shopify: 'customers', hubspot: 'contacts', salesforce: 'leads', mailchimp: 'subscribers', zendesk: 'users' };
const CREDENTIALS_FIRST_TEXT = {
  shopify: 'store domain and Admin API token',
  hubspot: 'Private App access token',
  mailchimp: 'API key and Audience/List ID',
  zendesk: 'subdomain, email and API token',
};

export default function ThirdPartyAppsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useResource('/api/settings/apps');
  const apps = data?.apps ?? [];
  const [selectedSlug, setSelectedSlug] = useState(null);
  const [busy, setBusy] = useState(false);

  const selected = apps.find((a) => a.slug === selectedSlug) ?? apps[0];

  const handleConnect = async () => {
    setBusy(true);
    try { await api.post(`/api/settings/apps/${selected.slug}/connect`, {}); toast(`${selected.name} connected.`, 'success'); reload(); }
    catch (err) { toast(err.message, 'danger'); }
    finally { setBusy(false); }
  };

  const handleDisconnect = async () => {
    if (!(await confirm(`Disconnect ${selected.name}?`, { title: 'Disconnect app' }))) return;
    setBusy(true);
    try { await api.post(`/api/settings/apps/${selected.slug}/disconnect`, {}); toast(`${selected.name} disconnected.`, 'success'); reload(); }
    catch (err) { toast(err.message, 'danger'); }
    finally { setBusy(false); }
  };

  const handleSync = async () => {
    setBusy(true);
    try {
      const result = await api.post(`/api/settings/apps/${selected.slug}/sync`, {});
      const unit = SYNC_SUMMARY_SLUGS[selected.slug];
      if (unit && result) {
        toast(`Synced: ${result.imported} new, ${result.duplicates} duplicate(s), ${result.failed} failed (of ${result.total} ${unit}).`, result.failed ? 'warning' : 'success');
      } else {
        toast(`${selected.name} synced.`, 'success');
      }
      reload();
    }
    catch (err) { toast(err.message, 'danger'); }
    finally { setBusy(false); }
  };

  if (loading) return <LoadingBox />;

  return (
    <div>
      <div className="mb-1">
        <h5 className="fw-bold mb-0 text-brand">Third Party Apps</h5>
        <div className="text-muted text-12">Tools connected to Dot Domino.</div>
      </div>

      <div className="row g-3 mt-3">
        <div className="col-lg-6">
          <div className="card crm-card h-100">
            <div className="card-body p-4">
              <div className="text-11 fw-bold text-uppercase ls-wide text-muted-3 mb-3">Integrations</div>
              <div className="row g-2">
                {apps.map((app) => (
                  <div className="col-6" key={app.slug}>
                    <button
                      className={`crm-app-tile ${selected?.slug === app.slug ? 'active' : ''}`}
                      onClick={() => setSelectedSlug(app.slug)}
                    >
                      <i className={`bi bi-${app.icon} crm-app-tile-icon`} />
                      <div className="fw-bold text-14 mt-2">{app.name}</div>
                      <span className={`badge badge-crm mt-2 badge-${app.connected ? 'live' : 'draft'}`}>
                        {app.connected ? 'Connected' : 'Not Connected'}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {selected && (
          <div className="col-lg-6">
            <div className="card crm-card h-100">
              <div className="card-body p-4">
                <div className="text-11 fw-bold text-uppercase ls-wide text-muted-3 mb-3">{selected.name}</div>

                <div className="d-flex justify-content-between align-items-center py-2 border-bottom">
                  <span className="text-13 text-muted-2">Type</span>
                  <span className="fw-bold text-14 text-capitalize">{selected.type}</span>
                </div>
                <div className="d-flex justify-content-between align-items-center py-2 border-bottom">
                  <span className="text-13 text-muted-2">Status</span>
                  <span className={`badge badge-crm badge-${selected.connected ? 'live' : 'draft'}`}>{selected.connected ? 'Active' : 'Inactive'}</span>
                </div>
                <div className="d-flex justify-content-between align-items-center py-2 mb-3">
                  <span className="text-13 text-muted-2">Last Sync</span>
                  <span className="fw-bold text-14">{selected.last_sync ? `${timeAgo(selected.last_sync)} ago` : '—'}</span>
                </div>

                {selected.connected && (selected.config?.email || selected.config?.shop || selected.config?.name) && (
                  <div className="d-flex justify-content-between align-items-center py-2 border-bottom mb-3">
                    <span className="text-13 text-muted-2">Connected as</span>
                    <span className="fw-bold text-14">{selected.config.email || selected.config.name || selected.config.shop}</span>
                  </div>
                )}

                {CREDENTIALS_FIRST_TEXT[selected.slug] && !selected.connected && (
                  <p className="text-13 text-muted-2 mb-2">
                    Enter your {CREDENTIALS_FIRST_TEXT[selected.slug]} in{' '}
                    <strong>Settings → Integrations → Lead Sources API → {selected.name}</strong> first, then connect from either page.
                  </p>
                )}

                {OAUTH_ONLY_SLUGS.includes(selected.slug) ? (
                  selected.connected ? (
                    <>
                      <button className="btn-crm w-100 justify-content-center mb-2" disabled={busy} onClick={handleSync}>
                        {busy ? 'Syncing…' : 'Sync Now'}
                      </button>
                      <button className="btn btn-outline-danger w-100" disabled={busy} onClick={handleDisconnect}>Disconnect</button>
                    </>
                  ) : (
                    <>
                      <p className="text-13 text-muted-2 mb-2">
                        Connect via <strong>Settings → Integrations → Lead Sources API</strong> — you'll need an OAuth
                        Client ID/Secret from {selected.slug === 'google_sheets' ? 'Google Cloud Console' : 'a Salesforce Connected App'} set up there first.
                      </p>
                      <a href="/settings/integrations" className="btn btn-outline-secondary w-100 justify-content-center d-flex align-items-center gap-1">
                        Go to Lead Sources API settings
                      </a>
                    </>
                  )
                ) : selected.connected ? (
                  <>
                    <button className="btn-crm w-100 justify-content-center mb-2" disabled={busy} onClick={handleSync}>
                      {busy ? 'Syncing…' : 'Manual Sync'}
                    </button>
                    <button className="btn btn-outline-danger w-100" disabled={busy} onClick={handleDisconnect}>Disconnect</button>
                  </>
                ) : (
                  <button className="btn-crm w-100 justify-content-center" disabled={busy} onClick={handleConnect}>
                    {busy ? 'Connecting…' : 'Connect'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
