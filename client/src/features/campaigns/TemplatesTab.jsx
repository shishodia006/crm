import { useState } from 'react';
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

function TemplateCard({ template }) {
  const navigate = useNavigate();
  return (
    <div className="col-md-6 col-xl-4">
      <div className="card crm-report-card h-100" style={{ '--report-accent': '#7c3aed' }} onClick={() => navigate(`/templates/${template.id}`)} role="button">
        <div className="text-center py-4" style={{ background: '#ede9fe', fontSize: 34, borderRadius: '14px 14px 0 0' }}>{iconFor(template)}</div>
        <div className="card-body p-3">
          <div className="fw-bold text-14 text-truncate">{template.name}</div>
          <div className="text-muted text-12 text-capitalize">{template.channel} &middot; used in {template.used_in_count} sequence{template.used_in_count === 1 ? '' : 's'}</div>
        </div>
      </div>
    </div>
  );
}

export default function TemplatesTab() {
  const toast = useToast();
  const [channel, setChannel] = useState('');
  const { data, loading, reload } = useResource(`/api/templates?channel=${channel}`, [channel]);
  const templates = data?.templates ?? [];

  const syncWa = async () => {
    try {
      const r = await api.get('/api/templates/wa-sync?save=1');
      toast(`Synced ${r.imported ?? 0} WhatsApp templates.`, 'success');
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
        <button className="btn btn-sm btn-outline-success rounded-crm-xs ms-auto" onClick={syncWa}>
          <i className="bi bi-whatsapp me-1" />Sync WhatsApp
        </button>
      </div>

      {loading ? <LoadingBox /> : templates.length === 0 ? (
        <div className="card crm-card"><div className="card-body crm-empty">
          <i className="bi bi-file-earmark-text crm-empty-icon" />
          <div className="crm-empty-title">No templates yet</div>
        </div></div>
      ) : (
        <div className="row g-3">{templates.map((t) => <TemplateCard key={t.id} template={t} />)}</div>
      )}
    </div>
  );
}
