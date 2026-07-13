import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { money, moneyCompact, formatDate, initials } from '../../utils/formatters.js';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';

const STATUS_ACCENT = { red: '#ef4444', amber: '#f59e0b', green: '#22c55e', gray: '#c7cad1' };
const STATUS_TEXT_CLASS = { red: 'text-danger', amber: 'icon-amber', green: 'icon-green', gray: 'text-muted-3' };

function DealCard({ deal, onDragStart, onClick }) {
  const accent = STATUS_ACCENT[deal.status_color] || STATUS_ACCENT.gray;
  return (
    <div
      className="card border-0 shadow-sm crm-deal-card text-13"
      style={{ '--deal-accent': accent }}
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
    >
      <div className="card-body p-2">
        <div className="fw-semibold text-truncate">{deal.lead_name || deal.title}</div>
        <div className="fw-bold text-14" style={{ color: '#4d50d8' }}>{moneyCompact(deal.value)}</div>
        <div className="mt-1 d-flex justify-content-between align-items-center">
          <span className={`text-11 fw-semibold text-truncate ${STATUS_TEXT_CLASS[deal.status_color] || 'text-muted-3'}`}>
            {deal.status_text}
          </span>
          {deal.assigned_name && (
            <span className="crm-agent-avatar flex-shrink-0" title={deal.assigned_name}>{initials(deal.assigned_name)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function KanbanBoard({ stages, onReload }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [dragging, setDragging] = useState(null);

  const handleDrop = async (stageId) => {
    if (!dragging || dragging.stage_id === stageId) return;
    try {
      await api.post(`/api/deals/${dragging.id}/stage`, { stage_id: stageId });
      onReload();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setDragging(null);
    }
  };

  return (
    <div className="d-flex gap-3 overflow-auto pb-2 crm-pipeline-board">
      {stages.map((stage) => (
        <div key={stage.id} className="crm-pipeline-col flex-shrink-0" onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(stage.id)}>
          <div className="d-flex align-items-center gap-2 mb-1 px-1">
            <span className="rounded-circle flex-shrink-0" style={{ width: 8, height: 8, background: stage.color }} />
            <span className="fw-semibold text-13 text-truncate flex-grow-1">{stage.name}</span>
            <span className="badge badge-crm badge-purple">{stage.deals.length}</span>
          </div>
          <div className="text-11 text-muted-3 px-1 mb-2">{moneyCompact(stage.value)} total</div>

          <div className="d-flex flex-column gap-2">
            {stage.deals.map((deal) => (
              <DealCard key={deal.id} deal={deal} onDragStart={() => setDragging(deal)} onClick={() => navigate(`/deals/${deal.id}`)} />
            ))}
            {stage.deals.length === 0 && <div className="text-muted-3 text-11 text-center py-3">No deals</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

function DealsTable() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, loading } = useResource(`/api/deals?page=${page}`, [page]);
  const deals = data?.deals ?? [];

  if (loading) return <LoadingBox />;
  return (
    <div className="card crm-card">
      <div className="card-body p-4">
        <div className="table-responsive">
          <table className="table align-middle mb-0 crm-table">
            <thead><tr><th>Deal</th><th>Lead</th><th>Stage</th><th>Value</th><th>Agent</th><th>Created</th></tr></thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="crm-clickable-row" onClick={() => navigate(`/deals/${d.id}`)}>
                  <td className="fw-semibold">{d.title}</td>
                  <td>{d.lead_name || '—'}</td>
                  <td><span className="badge badge-crm badge-purple">{d.stage_name}</span></td>
                  <td className="text-revenue">{money(d.value)}</td>
                  <td>{d.agent_name || '—'}</td>
                  <td className="text-12">{formatDate(d.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {deals.length === 0 && <p className="text-muted text-center py-4 mb-0">No deals yet.</p>}
        {data && data.lastPage > 1 && (
          <div className="d-flex justify-content-between align-items-center mt-3">
            <span className="text-12 text-muted-3">Page {data.page} of {data.lastPage}</span>
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <button className="btn btn-sm btn-outline-secondary" disabled={page >= data.lastPage} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState('kanban');
  const { data, loading, reload } = useResource(viewMode === 'kanban' ? '/api/pipeline' : '', [viewMode]);

  const stages = data?.stages ?? [];
  const summary = data?.summary ?? { totalValue: 0, totalDeals: 0 };

  return (
    <div>
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
        <div>
          <h4 className="fw-bold mb-0 text-brand">Deals</h4>
          <div className="text-muted text-12">{money(summary.totalValue)} across {summary.totalDeals} active deals</div>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-secondary rounded-crm-xs text-13" onClick={() => setViewMode((v) => (v === 'kanban' ? 'table' : 'kanban'))}>
            <i className={`bi bi-${viewMode === 'kanban' ? 'list-ul' : 'kanban'} me-1`} />
            {viewMode === 'kanban' ? 'Table View' : 'Kanban View'}
          </button>
          <button className="btn-crm" onClick={() => navigate('/deals/new')}>
            <i className="bi bi-plus-lg" />New Deal
          </button>
        </div>
      </div>

      {viewMode === 'table' ? <DealsTable /> : (loading ? <LoadingBox /> : <KanbanBoard stages={stages} onReload={reload} />)}
    </div>
  );
}
