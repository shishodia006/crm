import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';

const CHANNEL_ICONS = {
  email: ['✉️', '📧', '📨'],
  whatsapp: ['💬', '📱', '✅'],
  sms: ['📲', '⏰', '🔔'],
  rcs: ['💡', '🗨️', '📣'],
};
const CHANNELS = ['', 'email', 'whatsapp', 'sms', 'rcs'];

function iconFor(template) {
  const set = CHANNEL_ICONS[template.channel] || ['📄'];
  return set[template.id % set.length];
}

function TemplateCard({ template, accountName }) {
  const navigate = useNavigate();
  return (
    <div className="col-md-6 col-xl-4">
      <div className="card crm-report-card h-100" style={{ '--report-accent': '#7c3aed' }} onClick={() => navigate(`/templates/${template.id}`)} role="button">
        <div className="text-center py-4" style={{ background: '#ede9fe', fontSize: 34, borderRadius: '14px 14px 0 0' }}>{iconFor(template)}</div>
        <div className="card-body p-3">
          <div className="fw-bold text-14 text-truncate">{template.name}</div>
          <div className="text-muted text-12 text-capitalize">{template.channel} &middot; used in {template.used_in_count} sequence{template.used_in_count === 1 ? '' : 's'}</div>
          {['whatsapp', 'rcs'].includes(template.channel) && (
            <div className="text-11 text-muted-3 mt-1"><i className="bi bi-person-badge me-1" />{accountName}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TemplatesTab() {
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

  const syncWa = async (syncChannel, accountId) => {
    try {
      const acctParam = accountId ? `&account_id=${accountId}` : '';
      const r = await api.get(`/api/templates/wa-sync?save=1&channel=${syncChannel}${acctParam}`);
      toast(`Synced ${r.imported ?? 0} ${syncChannel === 'rcs' ? 'RCS' : 'WhatsApp'} templates.`, 'success');
      reload();
    } catch (err) { toast(err.message, 'danger'); }
  };

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        {CHANNELS.map((c) => (
          <button key={c || 'all'} className={`btn btn-sm ${channel === c ? 'btn-crm' : 'btn-outline-secondary'} rounded-crm-xs`} onClick={() => setChannel(c)}>
            {c || 'All'}
          </button>
        ))}
        <div className="ms-auto d-flex align-items-center gap-2 flex-wrap">
          {waAccounts.length > 0 && (
            <select className="form-select form-select-sm" style={{ width: 170 }} value={waAccountId} onChange={(e) => setWaAccountId(e.target.value)}>
              <option value="">WA: Company default</option>
              {waAccounts.map((a) => <option key={a.id} value={a.id}>WA: {a.name}</option>)}
            </select>
          )}
          <button className="btn btn-sm btn-outline-success rounded-crm-xs" onClick={() => syncWa('whatsapp', waAccountId)}>
            <i className="bi bi-whatsapp me-1" />Sync WhatsApp
          </button>
          {rcsAccounts.length > 0 && (
            <select className="form-select form-select-sm" style={{ width: 170 }} value={rcsAccountId} onChange={(e) => setRcsAccountId(e.target.value)}>
              <option value="">RCS: Company default</option>
              {rcsAccounts.map((a) => <option key={a.id} value={a.id}>RCS: {a.name}</option>)}
            </select>
          )}
          <button className="btn-crm-outline btn-crm-sm" onClick={() => syncWa('rcs', rcsAccountId)}>
            <i className="bi bi-phone-vibrate me-1" />Sync RCS
          </button>
        </div>
      </div>

      {loading ? <LoadingBox /> : templates.length === 0 ? (
        <div className="card crm-card"><div className="card-body crm-empty">
          <i className="bi bi-file-earmark-text crm-empty-icon" />
          <div className="crm-empty-title">No templates yet</div>
        </div></div>
      ) : (
        <div className="row g-3">{templates.map((t) => <TemplateCard key={t.id} template={t} accountName={accountName(t.integration_account_id)} />)}</div>
      )}
    </div>
  );
}
