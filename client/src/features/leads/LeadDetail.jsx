import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { formatDateTime, scoreClass, scoreLabel } from '../../utils/formatters.js';

// ─── constants ────────────────────────────────────────────────────────────────

const ENROLL_STATUS = {
  active:    { color: '#22c55e', bg: '#f0fdf4', icon: 'play-circle-fill',  label: 'Active' },
  paused:    { color: '#f59e0b', bg: '#fffbeb', icon: 'pause-circle-fill', label: 'Paused' },
  completed: { color: '#3b82f6', bg: '#eff6ff', icon: 'check-circle-fill', label: 'Completed' },
  converted: { color: '#8b5cf6', bg: '#f5f3ff', icon: 'star-fill',         label: 'Converted' },
  exited:    { color: '#94a3b8', bg: '#f8fafc', icon: 'x-circle-fill',     label: 'Exited' },
};

const STEP_ICON = {
  email:'envelope-fill', send_email:'envelope-fill',
  whatsapp:'whatsapp', send_whatsapp:'whatsapp',
  rcs:'phone-vibrate-fill', send_rcs:'phone-vibrate-fill',
  sms:'chat-dots-fill', send_sms:'chat-dots-fill',
  multi_send:'collection-fill', wait:'hourglass-split',
  condition:'diagram-2-fill', assign_agent:'person-fill',
  task:'check2-square', create_task:'check2-square',
  move_pipeline:'arrow-right-circle-fill', update_score:'star-fill', exit:'door-open-fill',
};
const STEP_COLOR = {
  email:'#3b82f6', send_email:'#3b82f6',
  whatsapp:'#25d366', send_whatsapp:'#25d366',
  rcs:'#8b5cf6', send_rcs:'#8b5cf6',
  sms:'#f59e0b', send_sms:'#f59e0b',
  multi_send:'#06b6d4', wait:'#94a3b8', condition:'#f97316',
  assign_agent:'#0891b2', task:'#0891b2', create_task:'#0891b2',
  move_pipeline:'#6366f1', update_score:'#f59e0b', exit:'#94a3b8',
};
const CH_COLOR = { email:'#3b82f6', whatsapp:'#25d366', rcs:'#8b5cf6', sms:'#f59e0b' };
const CH_ICON  = { email:'envelope-fill', whatsapp:'whatsapp', rcs:'phone-vibrate-fill', sms:'chat-dots-fill' };
const CH_LABEL = { email:'EMAIL', whatsapp:'WHATSAPP', rcs:'RCS', sms:'SMS' };

function stepLabel(step) {
  try {
    const ad = typeof step.action_data === 'string' ? JSON.parse(step.action_data) : (step.action_data || {});
    if (ad.label) return ad.label;
  } catch { /* */ }
  if (step.type === 'wait') return `Wait ${step.delay_value} ${step.delay_unit}`;
  return (step.type?.replace('send_', '').replace('_', ' ') ?? 'Step').replace(/^\w/, c => c.toUpperCase());
}

// ─── Enrollment Progress Modal ────────────────────────────────────────────────

function EnrollmentModal({ leadId, enrollment: enroll, onClose }) {
  const [detail, setDetail] = useState(null);
  const [firstLoad, setFirstLoad] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const timerRef = useRef(null);

  const fetchDetail = useCallback((silent = false) => {
    api.get(`/api/leads/${leadId}/enrollments/${enroll.id}`)
      .then(d => { setDetail(d); setLastRefresh(new Date()); if (!silent) setFirstLoad(false); })
      .catch(() => { if (!silent) setFirstLoad(false); });
  }, [leadId, enroll.id]);

  useEffect(() => {
    fetchDetail(false);
    timerRef.current = setInterval(() => fetchDetail(true), 10000);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      clearInterval(timerRef.current);
      document.removeEventListener('keydown', onKey);
    };
  }, [fetchDetail, onClose]);

  const meta = ENROLL_STATUS[enroll.status] || ENROLL_STATUS.exited;
  const steps = detail?.steps ?? [];
  const comms  = detail?.comms  ?? [];

  const channelStats = ['email','whatsapp','sms','rcs'].reduce((acc, ch) => {
    const all = comms.filter(c => c.channel === ch);
    if (all.length) acc[ch] = {
      sent: all.length,
      delivered: all.filter(c => ['delivered','opened','clicked','replied'].includes(c.status)).length,
    };
    return acc;
  }, {});

  const executedCount = steps.filter(s => s.log_status === 'executed').length;

  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:1055, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={onClose}
    >
      <div style={{ position:'absolute', inset:0, background:'rgba(15,23,42,0.55)', backdropFilter:'blur(2px)' }} />

      <div
        onClick={e => e.stopPropagation()}
        style={{
          position:'relative', zIndex:1, width:'100%', maxWidth:540,
          maxHeight:'88vh', display:'flex', flexDirection:'column',
          background:'#fff', borderRadius:16, boxShadow:'0 24px 60px rgba(0,0,0,0.2)',
          overflow:'hidden',
        }}
      >
        {/* ── Header ── */}
        <div style={{ padding:'16px 18px 12px', background: meta.bg, borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:10, background: meta.color+'20', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <i className={`bi bi-${meta.icon}`} style={{ color: meta.color, fontSize:17 }} />
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:15, fontWeight:700, color:'#1e293b' }}>{enroll.campaign_name}</div>
              <div style={{ fontSize:11, color:'#64748b', marginTop:2, display:'flex', gap:10, flexWrap:'wrap' }}>
                <span><i className="bi bi-tag me-1" />{enroll.campaign_type ?? 'drip'}</span>
                <span><i className="bi bi-calendar3 me-1" />Enrolled {new Date(enroll.enrolled_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</span>
                {enroll.completed_at && <span><i className="bi bi-check2 me-1" />Done {new Date(enroll.completed_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</span>}
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
              <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, background: meta.color+'20', color: meta.color, textTransform:'uppercase' }}>
                {meta.label}
              </span>
              {/* live pulse */}
              <span title={lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString()}` : 'Live'}
                style={{ display:'flex', alignItems:'center', gap:3, fontSize:10, color:'#22c55e', fontWeight:700 }}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#22c55e', display:'inline-block', animation:'pulse 1.5s infinite' }} />
                Live
              </span>
              <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:20, lineHeight:1, padding:'0 2px' }}>×</button>
            </div>
          </div>

          {/* progress bar */}
          {steps.length > 0 && (
            <div style={{ marginTop:10 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em' }}>Progress</span>
                <span style={{ fontSize:10, color:'#64748b' }}>{executedCount}/{steps.length} steps</span>
              </div>
              <div style={{ height:5, background:'#e2e8f0', borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${steps.length ? (executedCount/steps.length)*100 : 0}%`, background: meta.color, borderRadius:3, transition:'width 0.4s' }} />
              </div>
            </div>
          )}
        </div>

        {firstLoad ? (
          <div style={{ padding:40, textAlign:'center', flex:1 }}>
            <div className="spinner-border spinner-border-sm text-primary" />
          </div>
        ) : (
          <div style={{ overflowY:'auto', flex:1 }}>

            {/* ── Channel stats ── */}
            {Object.keys(channelStats).length > 0 && (
              <div style={{ padding:'10px 18px', borderBottom:'1px solid #f8fafc', display:'flex', gap:14, flexWrap:'wrap' }}>
                {Object.entries(channelStats).map(([ch, stat]) => (
                  <div key={ch} style={{ display:'flex', alignItems:'center', gap:7 }}>
                    <div style={{ width:26, height:26, borderRadius:8, background: CH_COLOR[ch]+'18', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <i className={`bi bi-${CH_ICON[ch]}`} style={{ color: CH_COLOR[ch], fontSize:12 }} />
                    </div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:'#1e293b', lineHeight:1 }}>{stat.sent} sent</div>
                      {stat.delivered > 0 && <div style={{ fontSize:10, color:'#22c55e' }}>✓ {stat.delivered} delivered</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Next step info ── */}
            {enroll.status === 'active' && enroll.next_execute_at && (
              <div style={{ margin:'10px 18px 0', padding:'8px 12px', borderRadius:10, background:'#eff6ff', border:'1px solid #bfdbfe', display:'flex', alignItems:'center', gap:8 }}>
                <i className="bi bi-clock-fill" style={{ color:'#3b82f6', fontSize:14 }} />
                <div>
                  <div style={{ fontSize:11, fontWeight:600, color:'#1e40af' }}>Next step scheduled</div>
                  <div style={{ fontSize:10, color:'#3b82f6' }}>{new Date(enroll.next_execute_at).toLocaleString()}</div>
                </div>
              </div>
            )}

            {/* ── Workflow steps ── */}
            {steps.length > 0 && (
              <div style={{ padding:'12px 18px 6px' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Workflow Steps</div>
                {steps.map((step, idx) => {
                  const ls = step.log_status;
                  const isExecuted = ls === 'executed';
                  const isFailed   = ls === 'failed';
                  const isSkipped  = ls === 'skipped';
                  const isWaiting  = ls === 'pending';
                  const dotBg = isExecuted?'#22c55e':isFailed?'#ef4444':isSkipped?'#94a3b8':isWaiting?'#f59e0b':'#e2e8f0';
                  const dotIcon = isExecuted?'check-lg':isFailed?'x-lg':STEP_ICON[step.type]||'circle';
                  const stepCol = STEP_COLOR[step.type]||'#64748b';
                  let result = null;
                  try { result = typeof step.result === 'string' ? JSON.parse(step.result) : step.result; } catch {}

                  return (
                    <div key={step.id} style={{ display:'flex', gap:10, marginBottom:12, position:'relative' }}>
                      {idx < steps.length - 1 && (
                        <div style={{ position:'absolute', left:11, top:24, bottom:-12, width:2, background:'#f1f5f9', zIndex:0 }} />
                      )}
                      <div style={{ width:24, height:24, borderRadius:'50%', flexShrink:0, zIndex:1, background:dotBg, display:'flex', alignItems:'center', justifyContent:'center', boxShadow: isExecuted?'0 0 0 3px #22c55e20':isFailed?'0 0 0 3px #ef444420':'none' }}>
                        <i className={`bi bi-${dotIcon}`} style={{ color:'#fff', fontSize:10 }} />
                      </div>
                      <div style={{ flex:1, paddingTop:2 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                          <span style={{ fontSize:12, fontWeight:600, color:'#1e293b' }}>{stepLabel(step)}</span>
                          {!['wait','condition','exit'].includes(step.type) && (
                            <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:20, background: stepCol+'18', color:stepCol }}>
                              {step.type.replace('send_','').toUpperCase()}
                            </span>
                          )}
                          <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:20, marginLeft:'auto',
                            background: isExecuted?'#d1fae5':isFailed?'#fee2e2':isSkipped?'#f1f5f9':isWaiting?'#fef3c7':'#f1f5f9',
                            color:      isExecuted?'#15803d':isFailed?'#dc2626':isSkipped?'#64748b':isWaiting?'#92400e':'#94a3b8',
                          }}>
                            {isExecuted?'✓ Done':isFailed?'✗ Failed':isSkipped?'Skipped':isWaiting?'Waiting':'Pending'}
                          </span>
                        </div>
                        {step.delay_value > 0 && <div style={{ fontSize:10, color:'#94a3b8', marginTop:1 }}><i className="bi bi-clock me-1" />After {step.delay_value} {step.delay_unit}</div>}
                        {step.executed_at && <div style={{ fontSize:10, color:'#64748b', marginTop:1 }}>{formatDateTime(step.executed_at)}</div>}
                        {isFailed && result?.error && (
                          <div style={{ marginTop:3, padding:'3px 7px', borderRadius:5, background:'#fef2f2', border:'1px solid #fecaca', fontSize:10, color:'#dc2626' }}>
                            <i className="bi bi-exclamation-triangle-fill me-1" />{result.error}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Communications timeline ── */}
            {comms.length > 0 && (
              <div style={{ padding:'10px 18px 14px', borderTop:'1px solid #f1f5f9' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Message Log</div>
                <div style={{ position:'relative' }}>
                  <div style={{ position:'absolute', left:11, top:0, bottom:0, width:2, background:'#f1f5f9' }} />
                  {[...comms].reverse().map((c, i) => {
                    const isSent      = ['sent','delivered','opened','clicked','replied'].includes(c.status);
                    const isFailed    = c.status === 'failed';
                    const isDelivered = ['delivered','opened','clicked','replied'].includes(c.status);
                    const color = isFailed ? '#ef4444' : isSent ? CH_COLOR[c.channel]||'#64748b' : '#94a3b8';
                    return (
                      <div key={i} style={{ display:'flex', gap:10, marginBottom:10, position:'relative' }}>
                        <div style={{ width:24, height:24, borderRadius:'50%', flexShrink:0, zIndex:1, background: color+'18', border:`2px solid ${color}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <i className={`bi bi-${CH_ICON[c.channel]||'send-fill'}`} style={{ color, fontSize:10 }} />
                        </div>
                        <div style={{ flex:1, paddingTop:2 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                            <span style={{ fontSize:11, fontWeight:700, color: color }}>{CH_LABEL[c.channel]||c.channel?.toUpperCase()}</span>
                            <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:20,
                              background: isFailed?'#fee2e2':isDelivered?'#d1fae5':isSent?'#dbeafe':'#f1f5f9',
                              color:      isFailed?'#dc2626':isDelivered?'#15803d':isSent?'#1d4ed8':'#64748b',
                            }}>
                              {isFailed?'FAILED':isDelivered?'DELIVERED':c.status?.toUpperCase()}
                            </span>
                            <span style={{ fontSize:10, color:'#94a3b8', marginLeft:'auto' }}>{formatDateTime(c.created_at)}</span>
                          </div>
                          {c.subject && <div style={{ fontSize:11, color:'#374151', marginTop:1 }}>{c.subject}</div>}
                          {isFailed && c.failed_reason && (
                            <div style={{ marginTop:3, fontSize:10, color:'#dc2626' }}>{c.failed_reason}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {steps.length === 0 && comms.length === 0 && (
              <div style={{ padding:'32px 20px', textAlign:'center', color:'#94a3b8', fontSize:13 }}>
                <i className="bi bi-clock-history" style={{ fontSize:28, display:'block', marginBottom:8 }} />
                No activity yet for this campaign.
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}

// ─── Main LeadDetail ──────────────────────────────────────────────────────────

export default function LeadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [lead, setLead]             = useState(null);
  const [campaigns, setCampaigns]   = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modalEnrollment, setModalEnrollment] = useState(null);
  const [enrollSelect, setEnrollSelect] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    api.get(`/api/leads/${id}`)
      .then(d => {
        setLead(d.lead);
        setCampaigns(d.campaigns ?? []);
        setEnrollments(d.enrollments ?? []);
      })
      .catch(() => navigate('/leads'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  const handleDelete = async () => {
    if (!confirm('Delete this lead? This cannot be undone.')) return;
    try {
      await api.delete(`/api/leads/${id}`);
      toast('Lead deleted.', 'success');
      navigate('/leads');
    } catch (err) { toast(err.message, 'danger'); }
  };

  const handleEnroll = async () => {
    if (!enrollSelect) return;
    try {
      await api.post(`/api/leads/${id}/enroll`, { campaign_id: enrollSelect });
      toast('Lead enrolled.', 'success');
      setEnrollSelect('');
      reload();
    } catch (err) { toast(err.message, 'danger'); }
  };

  if (loading) return <LoadingBox />;
  if (!lead)   return null;

  return (
    <>
      {modalEnrollment && (
        <EnrollmentModal
          leadId={id}
          enrollment={modalEnrollment}
          onClose={() => setModalEnrollment(null)}
        />
      )}

      {/* Header */}
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

        {/* ── Left column — Campaign Enrollments ── */}
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body d-flex flex-column">
              <div className="d-flex align-items-center mb-3">
                <h6 className="fw-semibold mb-0 me-auto">
                  Campaign Enrollments
                  {enrollments.length > 0 && (
                    <span className="badge rounded-pill ms-2" style={{ background:'#ede9fe', color:'#7c3aed', fontSize:11 }}>
                      {enrollments.length}
                    </span>
                  )}
                </h6>
                <button className="btn btn-link btn-sm text-muted p-0" onClick={reload} title="Refresh">
                  <i className="bi bi-arrow-clockwise" />
                </button>
              </div>

              {enrollments.length === 0 ? (
                <div className="text-center py-4 flex-grow-1 d-flex flex-column align-items-center justify-content-center">
                  <i className="bi bi-send text-muted" style={{ fontSize:28 }} />
                  <p className="text-muted small mt-2 mb-0">Not enrolled in any campaign yet.</p>
                </div>
              ) : (
                <div className="d-flex flex-column gap-2 flex-grow-1">
                  {enrollments.map(e => {
                    const meta = ENROLL_STATUS[e.status] || ENROLL_STATUS.exited;
                    return (
                      <div
                        key={e.id}
                        onClick={() => setModalEnrollment(e)}
                        style={{
                          borderRadius:12, border:`1.5px solid ${meta.color}30`,
                          background: meta.bg, padding:'11px 13px',
                          cursor:'pointer',
                          transition:'box-shadow 0.15s, border-color 0.15s',
                        }}
                        onMouseEnter={e2 => { e2.currentTarget.style.boxShadow=`0 4px 16px ${meta.color}25`; e2.currentTarget.style.borderColor=meta.color; }}
                        onMouseLeave={e2 => { e2.currentTarget.style.boxShadow='none'; e2.currentTarget.style.borderColor=`${meta.color}30`; }}
                      >
                        <div style={{ display:'flex', alignItems:'flex-start', gap:9 }}>
                          <div style={{ width:30, height:30, borderRadius:8, flexShrink:0, background: meta.color+'20', display:'flex', alignItems:'center', justifyContent:'center' }}>
                            <i className={`bi bi-${meta.icon}`} style={{ color: meta.color, fontSize:14 }} />
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:700, color:'#1e293b', lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {e.campaign_name}
                            </div>
                            <div style={{ fontSize:10, color:'#94a3b8', marginTop:1 }}>
                              {new Date(e.enrolled_at).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})}
                            </div>
                          </div>
                          <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:20, background: meta.color+'20', color: meta.color, flexShrink:0, textTransform:'uppercase' }}>
                            {meta.label}
                          </span>
                        </div>

                        {e.status === 'active' && e.next_execute_at && (
                          <div style={{ marginTop:6, fontSize:10, color:'#3b82f6', background:'#eff6ff', borderRadius:6, padding:'2px 7px', display:'inline-flex', alignItems:'center', gap:4 }}>
                            <i className="bi bi-clock-fill" />Next: {new Date(e.next_execute_at).toLocaleString()}
                          </div>
                        )}
                        {e.exit_reason && (
                          <div style={{ marginTop:4, fontSize:10, color:'#94a3b8' }}>
                            {e.exit_reason.replace(/_/g,' ')}
                          </div>
                        )}
                        <div style={{ marginTop:7, fontSize:11, color: meta.color, fontWeight:700, display:'flex', alignItems:'center', gap:4 }}>
                          <i className="bi bi-bar-chart-steps" />View progress
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right column — Lead info + Score + Enroll ── */}
        <div className="col-lg-8">

          {/* Lead info */}
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

          {/* Score + Enroll side by side */}
          <div className="row g-3">
            <div className="col-sm-4">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body text-center d-flex flex-column align-items-center justify-content-center">
                  <div className={`display-5 fw-bold text-${scoreClass(lead.score)}`}>{lead.score ?? 0}</div>
                  <div className={`badge text-bg-${scoreClass(lead.score)} mt-1`}>{scoreLabel(lead.score)}</div>
                  <div className="text-muted small mt-2">Lead Score</div>
                </div>
              </div>
            </div>
            <div className="col-sm-8">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body d-flex flex-column justify-content-center">
                  <h6 className="fw-semibold mb-3">Enroll in Campaign</h6>
                  <select className="form-select form-select-sm mb-2" value={enrollSelect} onChange={e => setEnrollSelect(e.target.value)}>
                    <option value="">— Select Campaign —</option>
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm w-100" onClick={handleEnroll}>Enroll</button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
