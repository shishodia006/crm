import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { money } from '../../utils/formatters.js';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';

export default function PipelinePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data, loading, reload } = useResource('/api/pipeline');
  const [dragging, setDragging] = useState(null);

  const stages = data?.stages ?? [];
  const dealsByStage = data?.deals_by_stage ?? {};

  const handleDrop = async (stageId) => {
    if (!dragging || dragging.stage_id === stageId) return;
    try {
      await api.post(`/api/deals/${dragging.id}/stage`, { stage_id: stageId });
      reload();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setDragging(null);
    }
  };

  if (loading) return <LoadingBox />;

  return (
    <>
      {/* Header */}
      <div className="d-flex align-items-center mb-3">
        <h4 className="fw-bold mb-0 me-auto text-brand">Sales Pipeline</h4>
        <button className="btn btn-outline-secondary btn-sm me-2 d-flex align-items-center gap-1">
          <i className="bi bi-list-ul" />
          <span>List</span>
        </button>
        <button className="btn btn-crm btn-crm-sm" onClick={() => navigate('/deals/new')}>
          <i className="bi bi-plus-lg" />New Deal
        </button>
      </div>

      {/* Stage summary cards */}
      <div className="d-flex gap-2 overflow-auto mb-3 pb-1">
        {stages.map((stage) => {
          const deals = dealsByStage[stage.id] ?? [];
          const total = deals.reduce((s, d) => s + Number(d.value || 0), 0);
          return (
            <div
              key={stage.id}
              className="bg-white rounded-2 shadow-sm flex-shrink-0 crm-pipeline-stat-card"
              style={{
                borderTop: '1px solid #e5e7eb',
                borderRight: '1px solid #e5e7eb',
                borderBottom: '1px solid #e5e7eb',
                borderLeft: `4px solid ${stage.color}`,
              }}
            >
              <div className="px-3 py-2">
                <div className="text-uppercase text-muted text-10 fw-semibold mb-1 text-truncate">
                  {stage.name}
                </div>
                <div className="fw-bold text-13">{deals.length} deals</div>
                <div className="text-muted text-11 mt-1">{money(total)}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Kanban board */}
      <div className="d-flex gap-2 overflow-auto pb-2 crm-pipeline-board">
        {stages.map((stage) => {
          const deals = dealsByStage[stage.id] ?? [];
          return (
            <div
              key={stage.id}
              className="crm-pipeline-col flex-shrink-0"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(stage.id)}
            >
              {/* Column header pill */}
              <div className="d-flex align-items-center gap-2 mb-2 px-1">
                <span
                  className="rounded-circle flex-shrink-0"
                  style={{ width: 10, height: 10, background: stage.color, display: 'inline-block' }}
                />
                <span className="text-13 text-truncate flex-grow-1">
                  {stage.name}{' '}
                  <span className="text-muted">({deals.length})</span>
                </span>
                <button
                  className="btn p-0 text-muted crm-pipeline-add-btn"
                  title={`Add deal to ${stage.name}`}
                  onClick={() => navigate('/deals/new')}
                >
                  <i className="bi bi-plus-lg" />
                </button>
              </div>

              {/* Deal cards */}
              <div className="d-flex flex-column gap-2">
                {deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="card border-0 shadow-sm crm-deal-card text-13"
                    draggable
                    onDragStart={() => setDragging(deal)}
                    onClick={() => navigate(`/deals/${deal.id}`)}
                  >
                    <div className="card-body p-2">
                      <div className="fw-semibold text-truncate">{deal.title}</div>
                      <div className="text-muted text-truncate text-11">{deal.lead_name}</div>
                      <div className="mt-1 d-flex justify-content-between align-items-center">
                        <span className="text-primary fw-semibold">{money(deal.value)}</span>
                        {deal.assigned_name && (
                          <span className="badge bg-secondary-subtle text-secondary text-10">
                            {deal.assigned_name.split(' ')[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
