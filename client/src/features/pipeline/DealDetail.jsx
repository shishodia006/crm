import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { formatDateTime, money } from '../../utils/formatters.js';

export default function DealDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [deal, setDeal] = useState(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get(`/api/deals/${id}`)
      .then((d) => setDeal(d.deal))
      .catch(() => navigate('/pipeline'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/deals/${id}/note`, { body: note });
      setNote('');
      load();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const markWon = async () => {
    if (!confirm('Mark this deal as Won?')) return;
    try {
      await api.post(`/api/deals/${id}/won`, {});
      toast('Deal marked as Won!', 'success');
      load();
    } catch (err) { toast(err.message, 'danger'); }
  };

  const markLost = async () => {
    const reason = prompt('Reason for losing:');
    if (reason === null) return;
    try {
      await api.post(`/api/deals/${id}/lost`, { reason });
      toast('Deal marked as Lost.', 'warning');
      load();
    } catch (err) { toast(err.message, 'danger'); }
  };

  if (loading) return <LoadingBox />;
  if (!deal) return null;

  const activities = deal.activities ?? [];

  return (
    <>
      <div className="d-flex align-items-center mb-4 gap-2 flex-wrap">
        <button className="btn btn-link text-muted p-0 me-2" onClick={() => navigate('/pipeline')}>
          <i className="bi bi-arrow-left fs-5" />
        </button>
        <h4 className="fw-bold mb-0 me-auto">{deal.title}</h4>
        {deal.status === 'open' && (
          <>
            <button className="btn btn-success btn-sm" onClick={markWon}>Won</button>
            <button className="btn btn-outline-danger btn-sm" onClick={markLost}>Lost</button>
          </>
        )}
        {deal.status !== 'open' && (
          <span className={`badge text-bg-${deal.status === 'won' ? 'success' : 'danger'} fs-6`}>{deal.status}</span>
        )}
      </div>

      <div className="row g-3">
        <div className="col-lg-8">
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body">
              <div className="row g-3">
                {[
                  ['Lead', deal.lead_name], ['Value', money(deal.value)],
                  ['Stage', deal.stage_name], ['Assigned', deal.assigned_name],
                  ['Expected Close', deal.expected_close_date], ['Status', deal.status],
                ].map(([label, val]) => (
                  <div key={label} className="col-sm-4">
                    <div className="text-muted small">{label}</div>
                    <div className="text-14">{val || '—'}</div>
                  </div>
                ))}
                {deal.notes && (
                  <div className="col-12">
                    <div className="text-muted small">Notes</div>
                    <div className="text-14 pre-wrap">{deal.notes}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <h6 className="fw-semibold mb-3">Activity</h6>
              <form onSubmit={addNote} className="d-flex gap-2 mb-3">
                <input
                  className="form-control form-control-sm"
                  placeholder="Add a note…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <button className="btn btn-primary btn-sm flex-shrink-0" disabled={saving}>Add</button>
              </form>
              {activities.length === 0 ? (
                <p className="text-muted small">No activity yet.</p>
              ) : (
                <ul className="list-unstyled mb-0">
                  {activities.map((a, i) => (
                    <li key={i} className="d-flex gap-3 mb-3">
                      <i className={`bi bi-${a.type === 'note' ? 'chat-left-text' : a.type === 'task' ? 'check2-square' : 'calendar-event'} text-primary mt-1`} />
                      <div>
                        <div className="text-13">{a.body || a.description}</div>
                        <div className="text-muted text-11">{formatDateTime(a.created_at)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <h6 className="fw-semibold mb-3">Quick Actions</h6>
              <div className="d-grid gap-2">
                <button className="btn btn-outline-primary btn-sm" onClick={() => navigate(`/leads/${deal.lead_id}`)}>
                  <i className="bi bi-person me-1" />View Lead
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
