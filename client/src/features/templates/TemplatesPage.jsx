import { useState } from 'react';
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
  const { data, loading, reload } = useResource(`/api/templates?channel=${channel}`, [channel]);
  const templates = data?.templates ?? [];

  const syncWa = async () => {
    try {
      await api.get('/api/templates/wa-sync');
      toast('WhatsApp templates synced.', 'success');
      reload();
    } catch (err) {
      toast(err.message, 'danger');
    }
  };

  const columns = [
    { label: 'Name', key: 'name', render: (r) => <span className="fw-semibold">{r.name}</span> },
    { label: 'Channel', render: (r) => <span className="badge bg-primary-subtle text-primary">{r.channel}</span> },
    { label: 'Subject', render: (r) => <span className="text-truncate d-block max-w-200 text-13">{r.subject || '—'}</span> },
    { label: 'Status', render: (r) => <span className={`badge text-bg-${r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'secondary'}`}>{r.status}</span> },
    { label: 'Updated', render: (r) => formatDate(r.updated_at) },
  ];

  return (
    <>
      <div className="d-flex align-items-center mb-4 gap-2 flex-wrap">
        <h4 className="fw-bold mb-0 me-auto">Templates</h4>
        <button className="btn btn-outline-success btn-sm" onClick={syncWa}>
          <i className="bi bi-whatsapp me-1" />Sync WhatsApp
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => navigate('/templates/new')}>
          <i className="bi bi-plus-lg me-1" />New Template
        </button>
      </div>

      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body py-2 d-flex gap-2">
          {CHANNELS.map((c) => (
            <button
              key={c || 'all'}
              className={`btn btn-sm ${channel === c ? 'btn-primary' : 'btn-outline-secondary'}`}
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
