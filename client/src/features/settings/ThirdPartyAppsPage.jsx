import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import { useConfirm } from '../../hooks/useConfirm.js';
import { timeAgo } from '../../utils/formatters.js';

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
    try { await api.post(`/api/settings/apps/${selected.slug}/sync`, {}); toast(`${selected.name} synced.`, 'success'); reload(); }
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

                {selected.connected ? (
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
