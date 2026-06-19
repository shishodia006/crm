import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { formatDateTime, scoreClass, scoreLabel } from '../../utils/formatters.js';

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [lead, setLead] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEnrollment, setFilterEnrollment] = useState(null); // enrollment_id to filter timeline

  const reload = () => {
    setLoading(true);
    Promise.all([
      api.get(`/api/leads/${id}`),
      api.get(`/api/leads/${id}/timeline`),
    ]).then(([d, tl]) => {
      setLead(d.lead);
      setTimeline(Array.isArray(tl) ? tl : []);
      setCampaigns(d.campaigns ?? []);
      setEnrollments(d.enrollments ?? []);
    }).catch(() => navigate('/leads')).finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, [id]);

  const handleDelete = async () => {
    if (!confirm('Delete this lead? This cannot be undone.')) return;
    try {
      await api.delete(`/api/leads/${id}`);
      toast('Lead deleted.', 'success');
      navigate('/leads');
    } catch (err) {
      toast(err.message, 'danger');
    }
  };

  const handleEnroll = async (campaignId) => {
    try {
      await api.post(`/api/leads/${id}/enroll`, { campaign_id: campaignId });
      toast('Lead enrolled.', 'success');
      reload();
    } catch (err) {
      toast(err.message, 'danger');
    }
  };

  if (loading) return <LoadingBox />;
  if (!lead) return null;

  return (
    <>
      <div className="d-flex align-items-center mb-4 gap-2 flex-wrap">
        <button className="btn btn-link text-muted p-0 me-2" onClick={() => navigate('/leads')}>
          <i className="bi bi-arrow-left fs-5" />
        </button>
        <h4 className="fw-bold mb-0 me-auto">{lead.name}</h4>
        <button className="btn btn-outline-primary btn-sm" onClick={() => navigate(`/leads/${id}/edit`)}>
          <i className="bi bi-pencil me-1" />Edit
        </button>
        <button className="btn btn-outline-danger btn-sm" onClick={handleDelete}>
          <i className="bi bi-trash me-1" />Delete
        </button>
      </div>

      <div className="row g-3">
        <div className="col-lg-8">
          {/* Lead info card */}
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body">
              <div className="row g-3">
                {[
                  ['Email', lead.email], ['Mobile', lead.mobile], ['Company', lead.company],
                  ['Designation', lead.designation], ['Industry', lead.industry],
                  ['City/State', [lead.city, lead.state].filter(Boolean).join(', ')],
                  ['Country', lead.country], ['Source', lead.source_name],
                  ['Status', lead.status], ['Assigned To', lead.assigned_name],
                ].map(([label, val]) => (
                  <div key={label} className="col-sm-6">
                    <div className="text-muted small">{label}</div>
                    <div className="text-14">{val || '—'}</div>
                  </div>
                ))}
                {lead.product_interest && (
                  <div className="col-12">
                    <div className="text-muted small">Requirement</div>
                    <div className="text-14">{lead.product_interest}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="d-flex align-items-center mb-3 flex-wrap gap-2">
                <h6 className="fw-semibold mb-0 me-auto">Activity Timeline</h6>
                {filterEnrollment && (
                  <span style={{ fontSize: 11, fontWeight: 700, background: '#ede9fe', color: '#7c3aed', padding: '2px 10px', borderRadius: 20 }}>
                    {enrollments.find(e => e.id === filterEnrollment)?.campaign_name || 'Campaign'}
                    <button type="button" className="btn-close ms-2" style={{ fontSize: 8 }} onClick={() => setFilterEnrollment(null)} />
                  </span>
                )}
                <button className="btn btn-link btn-sm text-muted p-0" onClick={reload} title="Refresh">
                  <i className="bi bi-arrow-clockwise" />
                </button>
              </div>
              {(() => {
                const visible = filterEnrollment
                  ? timeline.filter(ev => ev.entity !== 'communication' || ev.enrollment_id === filterEnrollment)
                  : timeline;
                if (visible.length === 0) return (
                  <div className="text-center py-4">
                    <i className="bi bi-clock-history text-muted" style={{ fontSize: 28 }} />
                    <p className="text-muted small mt-2 mb-0">{filterEnrollment ? 'No messages for this campaign yet.' : 'No activity yet.'}</p>
                    {!filterEnrollment && <p className="text-muted" style={{ fontSize: 11 }}>Run the drip cron to process enrollments.</p>}
                  </div>
                );
                return (
                <div style={{ position: 'relative' }}>
                  {/* vertical line */}
                  <div style={{ position: 'absolute', left: 15, top: 8, bottom: 8, width: 2, background: '#f1f5f9', borderRadius: 2 }} />
                  {visible.map((ev, i) => {
                    const isFailed = ev.status === 'failed';
                    const isSent   = ev.status === 'sent' || ev.status === 'delivered';
                    const isQueued = ev.status === 'queued';

                    const CHANNEL_ICON = { email: 'envelope-fill', whatsapp: 'whatsapp', rcs: 'phone-vibrate-fill', sms: 'chat-dots-fill' };
                    const CHANNEL_COLOR = { email: '#3b82f6', whatsapp: '#25d366', rcs: '#8b5cf6', sms: '#f59e0b' };
                    const ENTITY_ICON = { activity: 'lightning-charge-fill', score_event: 'star-fill', communication: CHANNEL_ICON[ev.subtype] || 'send-fill' };
                    const ENTITY_COLOR = { activity: '#0891b2', score_event: '#f59e0b', communication: CHANNEL_COLOR[ev.subtype] || '#64748b' };

                    const dotColor = ev.entity === 'communication'
                      ? (isFailed ? '#ef4444' : isSent ? '#22c55e' : '#94a3b8')
                      : ENTITY_COLOR[ev.entity] || '#94a3b8';

                    return (
                      <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 16, position: 'relative' }}>
                        {/* dot */}
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%', flexShrink: 0, zIndex: 1,
                          background: dotColor + '18', border: `2px solid ${dotColor}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: dotColor, fontSize: 12,
                        }}>
                          <i className={`bi bi-${ENTITY_ICON[ev.entity] || 'circle-fill'}`} />
                        </div>

                        <div style={{ flex: 1, paddingTop: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {/* channel/type badge */}
                            <span style={{
                              fontSize: 11, fontWeight: 700,
                              color: ENTITY_COLOR[ev.entity] || '#64748b',
                              textTransform: 'capitalize',
                            }}>
                              {ev.entity === 'communication' ? ev.subtype?.toUpperCase() : ev.subtype || ev.entity}
                            </span>

                            {/* status badge */}
                            {ev.status && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                                background: isFailed ? '#fee2e2' : isSent ? '#d1fae5' : isQueued ? '#fef3c7' : '#f1f5f9',
                                color:      isFailed ? '#dc2626' : isSent ? '#15803d' : isQueued ? '#92400e' : '#64748b',
                              }}>
                                {isFailed ? 'FAILED' : isSent ? 'SENT' : ev.status?.toUpperCase()}
                              </span>
                            )}

                            <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 'auto' }}>
                              {formatDateTime(ev.created_at)}
                            </span>
                          </div>

                          {/* summary */}
                          {ev.summary && (
                            <div style={{ fontSize: 12, color: '#374151', marginTop: 2, lineHeight: 1.4 }}>
                              {ev.summary}
                              {ev.user_name && <span style={{ color: '#94a3b8' }}> — {ev.user_name}</span>}
                            </div>
                          )}

                          {/* failed reason */}
                          {isFailed && ev.detail && (
                            <div style={{
                              marginTop: 4, padding: '4px 8px', borderRadius: 5,
                              background: '#fef2f2', border: '1px solid #fecaca',
                              fontSize: 11, color: '#dc2626', wordBreak: 'break-all',
                            }}>
                              <i className="bi bi-exclamation-triangle-fill me-1" />
                              {ev.detail}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                );
              })()}
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          {/* Score card */}
          <div className="card border-0 shadow-sm mb-3">
            <div className="card-body text-center">
              <div className={`display-5 fw-bold text-${scoreClass(lead.score)}`}>{lead.score ?? 0}</div>
              <div className={`badge text-bg-${scoreClass(lead.score)} mt-1`}>{scoreLabel(lead.score)}</div>
              <div className="text-muted small mt-2">Lead Score</div>
            </div>
          </div>

          {/* Enroll in campaign */}
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <h6 className="fw-semibold mb-3">Enroll in Campaign</h6>
              <select className="form-select form-select-sm mb-2" id="enroll-select">
                <option value="">— Select Campaign —</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button
                className="btn btn-primary btn-sm w-100"
                onClick={() => {
                  const sel = document.getElementById('enroll-select').value;
                  if (sel) handleEnroll(sel);
                }}
              >
                Enroll
              </button>

              {/* Active enrollments */}
              {enrollments.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                    Current Enrollments
                  </div>
                  {enrollments.map(e => {
                    const STATUS_COLOR = { active: '#22c55e', paused: '#f59e0b', completed: '#3b82f6', exited: '#94a3b8' };
                    const col = STATUS_COLOR[e.status] || '#94a3b8';
                    const isSelected = filterEnrollment === e.id;
                    return (
                      <div key={e.id}
                        onClick={() => setFilterEnrollment(isSelected ? null : e.id)}
                        style={{
                          padding: '8px 10px', borderRadius: 7, marginBottom: 6, cursor: 'pointer',
                          background: isSelected ? col + '20' : col + '10',
                          border: `1px solid ${isSelected ? col : col + '30'}`,
                          transition: 'all 0.15s',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {e.campaign_name}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: col, textTransform: 'uppercase', flexShrink: 0 }}>
                            {e.status}
                          </span>
                        </div>
                        {e.next_execute_at && e.status === 'active' && (
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
                            Next: {new Date(e.next_execute_at).toLocaleString()}
                          </div>
                        )}
                        {e.exit_reason && (
                          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>
                            {e.exit_reason.replace(/_/g, ' ')}
                          </div>
                        )}
                        <div style={{ fontSize: 10, color: isSelected ? col : '#94a3b8', marginTop: 3, fontWeight: isSelected ? 700 : 400 }}>
                          {isSelected ? '▲ Showing this campaign only' : '▼ Click to filter timeline'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
