import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import Table from '../../components/common/Table.jsx';
import { formatDate } from '../../utils/formatters.js';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';

const CHANNELS = ['', 'email', 'whatsapp', 'sms', 'rcs'];

export default function TemplatesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [channel, setChannel] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [waAccountId, setWaAccountId] = useState('');
  const [rcsAccountId, setRcsAccountId] = useState('');
  const { data, loading, reload } = useResource(`/api/templates?channel=${channel}`, [channel]);
  const templates = data?.templates ?? [];

  useEffect(() => {
    api.get('/api/settings/integration-accounts').then((d) => setAccounts(d?.accounts ?? [])).catch(() => {});
  }, []);

  const accountsFor = (ch) => accounts.filter((a) => (a.channel === ch || a.channel === 'other') && a.is_active);
  const waAccounts = accountsFor('whatsapp');
  const rcsAccounts = accountsFor('rcs');
  const accountName = (id) => (id ? accounts.find((a) => String(a.id) === String(id))?.name : null) || 'Company default';

  const syncWa = async (syncChannel, accountId, silent = false) => {
    try {
      const acctParam = accountId ? `&account_id=${accountId}` : '';
      const r = await api.get(`/api/templates/wa-sync?save=1&channel=${syncChannel}${acctParam}`);
      if (!silent) toast(`Synced ${r.imported ?? 0} ${syncChannel === 'rcs' ? 'RCS' : 'WhatsApp'} templates.`, 'success');
      reload();
    } catch (err) {
      if (!silent) toast(err.message, 'danger');
      else console.error(`[templates] auto-sync ${syncChannel} failed:`, err.message);
    }
  };

  // Auto-sync once per visit so newly-created templates in Anantya show up
  // here without a manual "Sync WhatsApp"/"Sync RCS" click.
  useEffect(() => {
    syncWa('whatsapp', null, true);
    syncWa('rcs', null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const varCount = (r) => {
    if (!r.variables) return null;
    try {
      const v = typeof r.variables === 'string' ? JSON.parse(r.variables) : r.variables;
      return v?.count ?? null;
    } catch { return null; }
  };

  const columns = [
    { label: 'Name', key: 'name', render: (r) => <span className="fw-semibold">{r.name}</span> },
    { label: 'Channel', render: (r) => <span className="badge bg-primary-subtle text-primary">{r.channel}</span> },
    {
      label: 'Account',
      render: (r) => ['whatsapp', 'rcs'].includes(r.channel)
        ? <span className="text-13 text-muted">{accountName(r.integration_account_id)}</span>
        : <span className="text-muted">—</span>,
    },
    { label: 'Subject', render: (r) => <span className="text-truncate d-block max-w-200 text-13">{r.subject || '—'}</span> },
    {
      label: 'Variables',
      render: (r) => {
        const c = varCount(r);
        if (c === null) return <span className="text-muted text-13">—</span>;
        return <span className="badge bg-warning-subtle text-warning fw-semibold">{c} var{c !== 1 ? 's' : ''}</span>;
      }
    },
    { label: 'Status', render: (r) => <span className={`badge text-bg-${r.status === 'active' ? 'success' : r.status === 'archived' ? 'danger' : 'secondary'}`}>{r.status}</span> },
    { label: 'Updated', render: (r) => formatDate(r.updated_at) },
  ];

  return (
    <>
      <div className="d-flex align-items-center mb-4 gap-2 flex-wrap">
        <h4 className="fw-bold mb-0 me-auto">Templates</h4>
        {waAccounts.length > 0 && (
          <select className="form-select form-select-sm" style={{ width: 170 }} value={waAccountId} onChange={(e) => setWaAccountId(e.target.value)}>
            <option value="">WA: Company default</option>
            {waAccounts.map((a) => <option key={a.id} value={a.id}>WA: {a.name}</option>)}
          </select>
        )}
        <button className="btn btn-outline-success btn-sm" onClick={() => syncWa('whatsapp', waAccountId)}>
          <i className="bi bi-whatsapp me-1" />Sync WhatsApp
        </button>
        {rcsAccounts.length > 0 && (
          <select className="form-select form-select-sm" style={{ width: 170 }} value={rcsAccountId} onChange={(e) => setRcsAccountId(e.target.value)}>
            <option value="">RCS: Company default</option>
            {rcsAccounts.map((a) => <option key={a.id} value={a.id}>RCS: {a.name}</option>)}
          </select>
        )}
        <button className="btn-crm-outline" onClick={() => syncWa('rcs', rcsAccountId)}>
          <i className="bi bi-phone-vibrate me-1" />Sync RCS
        </button>
        <button className="btn-crm btn-crm-sm" onClick={() => navigate('/templates/new')}>
          <i className="bi bi-plus-lg me-1" />New Template
        </button>
      </div>

      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body py-2 d-flex gap-2">
          {CHANNELS.map((c) => (
            <button
              key={c || 'all'}
              className={channel === c ? 'btn-crm btn-crm-sm' : 'btn btn-outline-secondary btn-sm'}
              onClick={() => setChannel(c)}
            >
              {c || 'All'}
            </button>
          ))}
        </div>
      </div>

      <div className="card border-0 shadow-sm">
        {loading ? <LoadingBox /> : (
          <Table columns={columns} rows={templates} onRow={(r) => navigate(`/templates/${r.id}`)} />
        )}
      </div>
    </>
  );
}
