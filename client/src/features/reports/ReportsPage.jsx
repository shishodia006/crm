import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import { usePageTabs } from '../../hooks/usePageTabs.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { useToast } from '../../hooks/useToast.js';
import { useConfirm } from '../../hooks/useConfirm.js';
import { api } from '../../services/api.js';
import { money, timeAgo, initials } from '../../utils/formatters.js';

const TABS = [
  { key: 'mine', label: 'My Reports' },
  { key: 'shared', label: 'Shared with Me' },
  { key: 'templates', label: 'Templates' },
  { key: 'scheduled', label: 'Scheduled' },
];

const VISIBILITY_LABEL = { private: 'Private', team: 'Team', link: 'Private link' };
const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* ── My Reports card ────────────────────────────────────── */
function ReportCard({ report, onOpen }) {
  const color = report.color || '#7c3aed';
  return (
    <div className="col-md-6 col-xl-4">
      <button type="button" className="card crm-report-card h-100 text-start w-100 border-0 p-0" style={{ '--report-accent': color }} onClick={() => onOpen(report.id)}>
        <div className="card-body p-4">
          <div className="crm-report-icon" style={{ background: `${color}1a`, color }}>
            <i className={`bi bi-${report.icon || 'bar-chart-fill'}`} />
          </div>
          <div className="fw-bold text-14 mt-3 mb-1">{report.name}</div>
          <div className="text-muted text-12 mb-3 crm-report-desc">{report.description || '—'}</div>
          <div className="d-flex align-items-center justify-content-between crm-report-footer">
            <span className="text-11 text-muted-3">Edited {timeAgo(report.updated_at)} ago</span>
            <span className={`badge badge-crm badge-${report.status === 'live' ? 'live' : 'draft'}`}>{report.status === 'live' ? 'Live' : 'Draft'}</span>
          </div>
        </div>
      </button>
    </div>
  );
}

/* ── Templates card ──────────────────────────────────────── */
function TemplateCard({ tpl, onUse }) {
  return (
    <div className="col-md-6 col-xl-4">
      <div className="card crm-report-card h-100" style={{ '--report-accent': tpl.color }}>
        <div className="card-body p-4">
          <div className="crm-report-icon" style={{ background: `${tpl.color}1a`, color: tpl.color }}>
            <i className={`bi bi-${tpl.icon}`} />
          </div>
          <div className="fw-bold text-14 mt-3 mb-1">{tpl.label}</div>
          <div className="text-muted text-12 mb-3 crm-report-desc">{tpl.description}</div>
          <div className="d-flex align-items-center justify-content-between crm-report-footer">
            <span className="text-11 text-muted-3">Template</span>
            <button type="button" className="btn btn-link p-0 text-13 fw-semibold text-decoration-none" onClick={() => onUse(tpl)}>
              Use <i className="bi bi-arrow-right ms-1" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Shared with Me table ────────────────────────────────── */
function SharedTable({ reports, onOpen }) {
  if (!reports.length) return <p className="text-muted text-center py-5 mb-0">Nothing has been shared with you yet.</p>;
  return (
    <div className="card crm-card"><div className="card-body p-4">
      <div className="table-responsive">
        <table className="table align-middle mb-0 crm-table">
          <thead><tr><th>Report</th><th>Owner</th><th>Last Viewed</th><th>Visibility</th></tr></thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} className="crm-clickable-row" onClick={() => onOpen(r.id)}>
                <td>
                  <div className="fw-semibold text-13">{r.name}</div>
                  <div className="text-11 text-muted-3">{r.description}</div>
                </td>
                <td>
                  <div className="d-flex align-items-center gap-2">
                    <span className="crm-agent-avatar">{initials(r.owner_name)}</span>{r.owner_name}
                  </div>
                </td>
                <td className="text-12">{r.last_viewed_at ? `${timeAgo(r.last_viewed_at)} ago` : '—'}</td>
                <td><span className="badge badge-crm badge-purple">{VISIBILITY_LABEL[r.visibility]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div></div>
  );
}

/* ── Scheduled table ─────────────────────────────────────── */
function ScheduledTable({ schedules }) {
  if (!schedules.length) return <p className="text-muted text-center py-5 mb-0">No reports are scheduled yet.</p>;
  return (
    <div className="card crm-card"><div className="card-body p-4">
      <div className="table-responsive">
        <table className="table align-middle mb-0 crm-table">
          <thead><tr><th>Report</th><th>Frequency</th><th>Recipients</th><th>Next Send</th><th>Status</th></tr></thead>
          <tbody>
            {schedules.map((s) => {
              let recipients = { type: 'team' };
              try { recipients = typeof s.recipients === 'string' ? JSON.parse(s.recipients) : s.recipients; } catch { /* ignore */ }
              return (
                <tr key={s.id}>
                  <td className="fw-semibold text-13">{s.report_name}</td>
                  <td className="text-capitalize">{s.frequency}{s.frequency === 'weekly' ? ` · ${DOW[s.day_of_week ?? 1]}` : ''}</td>
                  <td>{recipients.type === 'team' ? 'Whole team' : `${(recipients.user_ids || []).length} people`}</td>
                  <td className="text-12">{s.next_send_at ? new Date(s.next_send_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td><span className={`badge badge-crm badge-${s.status === 'active' ? 'live' : 'draft'}`}>{s.status === 'active' ? 'Active' : 'Paused'}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div></div>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="card crm-card"><div className="card-body crm-empty">
      <i className="bi bi-file-earmark-bar-graph crm-empty-icon" />
      <div className="crm-empty-title">No saved reports yet</div>
      <div className="crm-empty-sub">Create one from scratch, or use a template to get started faster.</div>
      <button className="btn-crm mt-3" onClick={onCreate}><i className="bi bi-plus-lg" />New Report</button>
    </div></div>
  );
}

/* ── Report data renderer (per data source) ──────────────── */
function ReportDataView({ dataSource, result }) {
  if (!result) return <p className="text-muted text-center py-4">No data.</p>;

  if (dataSource === 'revenue_by_source') {
    const rows = result.rows || [];
    return (
      <table className="table table-sm crm-table"><thead><tr><th>Source</th><th>Deals</th><th>Revenue</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}</td><td>{r.deals}</td><td className="text-revenue">{money(r.revenue)}</td></tr>)}</tbody>
      </table>
    );
  }
  if (dataSource === 'agent_leaderboard') {
    const agents = result.agents || [];
    return (
      <table className="table table-sm crm-table"><thead><tr><th>Agent</th><th>Leads</th><th>Conversions</th><th>Conv %</th><th>Revenue</th></tr></thead>
        <tbody>{agents.map((a) => <tr key={a.id}><td>{a.name}</td><td>{a.leads_assigned}</td><td>{a.conversions}</td><td>{a.conv_rate ?? 0}%</td><td className="text-revenue">{money(a.revenue)}</td></tr>)}</tbody>
      </table>
    );
  }
  if (dataSource === 'funnel_dropoff') {
    const funnel = result.funnel || [];
    return (
      <table className="table table-sm crm-table"><thead><tr><th>Stage</th><th>Count</th><th>Conversion</th><th>Health</th></tr></thead>
        <tbody>{funnel.map((f) => (
          <tr key={f.stage}><td>{f.stage}</td><td>{f.count}</td><td>{f.conversionPct == null ? '—' : `${f.conversionPct}%`}</td>
            <td><span className={`badge badge-crm badge-${String(f.health).toLowerCase()}`}>{f.health}</span></td></tr>
        ))}</tbody>
      </table>
    );
  }
  if (dataSource === 'stalled_deals') {
    const items = result.items || [];
    if (!items.length) return <p className="text-muted text-center py-4">Nothing stalled right now.</p>;
    return items.map((i) => (
      <div key={i.id} className="crm-action-row mb-2" style={{ '--action-accent': '#ef4444' }}>
        <div className="min-w-0"><div className="crm-action-name text-truncate">{i.name}</div><div className="crm-action-sub text-truncate">{i.reason}</div></div>
        <div className="crm-action-value flex-shrink-0">{money(i.value)}</div>
      </div>
    ));
  }
  if (dataSource === 'lead_source_roi') {
    const sources = result.sources || [];
    return (
      <table className="table table-sm crm-table"><thead><tr><th>Source</th><th>Leads</th><th>Conversion</th><th>Revenue</th></tr></thead>
        <tbody>{sources.map((s) => <tr key={s.name}><td>{s.name}</td><td>{s.total}</td><td>{s.conversionRate == null ? '—' : `${s.conversionRate}%`}</td><td className="text-revenue">{money(s.revenue)}</td></tr>)}</tbody>
      </table>
    );
  }
  if (dataSource === 'drip_performance') {
    const campaigns = result.campaigns || [];
    if (!campaigns.length) return <p className="text-muted text-center py-4">No active sequences.</p>;
    return campaigns.map((c) => (
      <div key={c.id} className="mb-3 pb-3 border-bottom">
        <div className="fw-semibold text-13 mb-1">{c.name}</div>
        <div className="text-12 text-muted-3">{c.enrolled} enrolled &middot; {c.openRate}% open &middot; {c.clickRate}% click &middot; {c.converted} converted</div>
      </div>
    ));
  }
  if (dataSource === 'response_time_sla') {
    const channels = result.channels || [];
    if (!channels.length) return <p className="text-muted text-center py-4">Not enough data yet.</p>;
    return (
      <table className="table table-sm crm-table"><thead><tr><th>Channel</th><th>Avg First Response</th><th>Leads</th></tr></thead>
        <tbody>{channels.map((c) => <tr key={c.channel}><td className="text-capitalize">{c.channel}</td><td>{c.avgLabel}</td><td>{c.leads}</td></tr>)}</tbody>
      </table>
    );
  }
  if (dataSource === 'regional_breakdown') {
    const regions = result.regions || [];
    return (
      <table className="table table-sm crm-table"><thead><tr><th>Region</th><th>Leads</th><th>Deals</th><th>Pipeline Value</th></tr></thead>
        <tbody>{regions.map((r) => <tr key={r.region}><td>{r.region}</td><td>{r.leads}</td><td>{r.deals}</td><td className="text-revenue">{money(r.pipelineValue)}</td></tr>)}</tbody>
      </table>
    );
  }
  return <p className="text-muted">No renderer for this report type.</p>;
}

/* ── Create / Use-template modal ─────────────────────────── */
function CreateReportModal({ prefill, catalog, onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: prefill?.label || '', description: prefill?.description || '',
    data_source: prefill?.key || '', visibility: 'private'
  });
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/custom-reports', form);
      toast('Report created.', 'success');
      onCreated();
    } catch (err) { toast(err.message, 'danger'); }
    finally { setSaving(false); }
  };

  return (
    <div className="crm-modal-backdrop" onClick={onClose}>
      <div className="crm-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="crm-modal-header">
          <div className="fw-bold text-15">{prefill ? 'Use Template' : 'New Report'}</div>
          <button className="crm-modal-close" onClick={onClose}><i className="bi bi-x-lg text-13" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-3">
            <label className="crm-label">Name</label>
            <input className="crm-input" value={form.name} onChange={set('name')} required />
          </div>
          <div className="mb-3">
            <label className="crm-label">Description</label>
            <textarea className="crm-input no-resize" rows={2} value={form.description} onChange={set('description')} />
          </div>
          <div className="mb-3">
            <label className="crm-label">Data Source</label>
            <select className="crm-select w-100" value={form.data_source} disabled={!!prefill} onChange={set('data_source')} required>
              <option value="">— Select —</option>
              {catalog.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div className="mb-3">
            <label className="crm-label">Visibility</label>
            <select className="crm-select w-100" value={form.visibility} onChange={set('visibility')}>
              <option value="private">Private — only me</option>
              <option value="team">Team — everyone in this company</option>
              <option value="link">Team + Link — also shareable outside the CRM</option>
            </select>
          </div>
          <div className="d-flex gap-2 mt-4">
            <button className="btn-crm flex-grow-1" disabled={saving}>{saving ? 'Saving…' : 'Save Report'}</button>
            <button type="button" className="btn btn-outline-secondary rounded-crm-btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Schedule modal ──────────────────────────────────────── */
function ScheduleModal({ report, members, onClose, onSaved }) {
  const toast = useToast();
  const [frequency, setFrequency] = useState('weekly');
  const [sendTime, setSendTime] = useState('09:00');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [recipientType, setRecipientType] = useState('team');
  const [userIds, setUserIds] = useState([]);
  const [saving, setSaving] = useState(false);

  const toggleUser = (id) => setUserIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/api/custom-reports/${report.id}/schedules`, {
        frequency, send_time: `${sendTime}:00`, day_of_week: Number(dayOfWeek), day_of_month: Number(dayOfMonth),
        recipients: recipientType === 'team' ? { type: 'team' } : { type: 'users', user_ids: userIds }
      });
      toast('Schedule created.', 'success');
      onSaved();
    } catch (err) { toast(err.message, 'danger'); }
    finally { setSaving(false); }
  };

  return (
    <div className="crm-modal-backdrop" onClick={onClose}>
      <div className="crm-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="crm-modal-header">
          <div className="fw-bold text-15">Schedule &ldquo;{report.name}&rdquo;</div>
          <button className="crm-modal-close" onClick={onClose}><i className="bi bi-x-lg text-13" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4">
          <div className="row g-3 mb-3">
            <div className="col-6">
              <label className="crm-label">Frequency</label>
              <select className="crm-select w-100" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="col-6">
              <label className="crm-label">Send Time</label>
              <input type="time" className="crm-input" value={sendTime} onChange={(e) => setSendTime(e.target.value)} />
            </div>
          </div>
          {frequency === 'weekly' && (
            <div className="mb-3">
              <label className="crm-label">Day of Week</label>
              <select className="crm-select w-100" value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
                {DOW.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </div>
          )}
          {frequency === 'monthly' && (
            <div className="mb-3">
              <label className="crm-label">Day of Month</label>
              <input type="number" min={1} max={28} className="crm-input" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
            </div>
          )}
          <div className="mb-3">
            <label className="crm-label">Recipients</label>
            <select className="crm-select w-100 mb-2" value={recipientType} onChange={(e) => setRecipientType(e.target.value)}>
              <option value="team">Whole team</option>
              <option value="users">Specific people</option>
            </select>
            {recipientType === 'users' && (
              <div className="crm-lead-pick-results">
                {members.map((m) => (
                  <label key={m.id} className="crm-lead-pick-item" style={{ cursor: 'pointer' }}>
                    <input type="checkbox" className="form-check-input me-2" checked={userIds.includes(m.id)} onChange={() => toggleUser(m.id)} />
                    {m.name} <span className="text-muted-3 text-11 ms-1">{m.email}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="d-flex gap-2 mt-4">
            <button className="btn-crm flex-grow-1" disabled={saving}>{saving ? 'Saving…' : 'Save Schedule'}</button>
            <button type="button" className="btn btn-outline-secondary rounded-crm-btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Report detail drawer ────────────────────────────────── */
function ReportDrawer({ reportId, catalog, members, onClose, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: reportData } = useResource(reportId ? `/api/custom-reports/${reportId}` : '', [reportId]);
  const { data: dataResult, loading: dataLoading } = useResource(reportId ? `/api/custom-reports/${reportId}/data` : '', [reportId]);
  const [showSchedule, setShowSchedule] = useState(false);
  const report = reportData?.report;
  const catalogEntry = catalog.find((c) => c.key === report?.data_source);

  const handleDelete = async () => {
    if (!(await confirm('Delete this report? This cannot be undone.', { title: 'Delete report' }))) return;
    try {
      await api.delete(`/api/custom-reports/${reportId}`);
      toast('Report deleted.', 'success');
      onChanged(); onClose();
    } catch (err) { toast(err.message, 'danger'); }
  };

  const handleVisibility = async (e) => {
    try {
      await api.patch(`/api/custom-reports/${reportId}`, { visibility: e.target.value });
      toast('Visibility updated.', 'success');
      onChanged();
    } catch (err) { toast(err.message, 'danger'); }
  };

  return (
    <>
      {reportId && <div className="crm-drawer-backdrop" onClick={onClose} />}
      <div className={`crm-drawer ${reportId ? 'open' : ''}`} style={{ width: 560 }}>
        {report && (
          <>
            <div className="crm-drawer-header">
              <div className="crm-drawer-title"><i className={`bi bi-${report.icon || 'bar-chart-fill'}`} />{report.name}</div>
              <button className="crm-drawer-close" onClick={onClose}><i className="bi bi-x-lg text-13" /></button>
            </div>
            <div className="crm-drawer-body">
              {report.description && <p className="text-muted text-13">{report.description}</p>}
              <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
                <span className="badge badge-crm badge-purple">{catalogEntry?.label || report.data_source}</span>
                <span className={`badge badge-crm badge-${report.status === 'live' ? 'live' : 'draft'}`}>{report.status === 'live' ? 'Live' : 'Draft'}</span>
                <select className="crm-select text-11" style={{ width: 'auto' }} value={report.visibility} onChange={handleVisibility}>
                  <option value="private">Private</option>
                  <option value="team">Team</option>
                  <option value="link">Team + Link</option>
                </select>
              </div>
              {report.visibility === 'link' && report.share_token && (
                <div className="crm-insight-banner info mb-3 text-truncate">
                  <i className="bi bi-link-45deg" />{window.location.origin}/public/reports/{report.share_token}
                </div>
              )}
              <hr />
              {dataLoading ? <LoadingBox /> : <ReportDataView dataSource={report.data_source} result={dataResult?.result} />}
            </div>
            <div className="crm-drawer-footer">
              <button className="btn btn-outline-secondary rounded-crm-btn text-13 flex-grow-1" onClick={() => setShowSchedule(true)}>
                <i className="bi bi-alarm me-1" />Schedule
              </button>
              <button className="btn btn-outline-danger rounded-crm-btn text-13" onClick={handleDelete}><i className="bi bi-trash" /></button>
            </div>
          </>
        )}
      </div>
      {showSchedule && report && (
        <ScheduleModal report={report} members={members} onClose={() => setShowSchedule(false)}
          onSaved={() => { setShowSchedule(false); onChanged(); }} />
      )}
    </>
  );
}

/* ── Main page ────────────────────────────────────────────── */
export default function ReportsPage() {
  const [tab, setTab] = useState('mine');
  const [showCreate, setShowCreate] = useState(false);
  const [createPrefill, setCreatePrefill] = useState(null);
  const [openReportId, setOpenReportId] = useState(null);

  const { data: countsData, reload: reloadCounts } = useResource('/api/custom-reports/counts');
  const { data: listData, loading: listLoading, reload: reloadList } = useResource(`/api/custom-reports?tab=${tab}`, [tab]);
  const { data: catalogData } = useResource('/api/custom-reports?tab=templates');
  const { data: membersData } = useResource('/api/companies/members');

  const counts = countsData || { mine: 0, shared: 0, templates: 0, scheduled: 0 };
  const catalog = catalogData?.reports ?? [];
  const members = membersData?.members ?? [];

  const tabsWithBadges = TABS.map((t) => ({ ...t, badge: counts[t.key] }));
  usePageTabs(tabsWithBadges, tab, setTab);

  const refreshAll = () => { reloadCounts(); reloadList(); };
  const handleExport = () => { window.location = `/api/custom-reports/export?tab=${tab}`; };
  const handleUseTemplate = (tpl) => { setCreatePrefill(tpl); setShowCreate(true); };

  return (
    <div>
      <div className="d-flex align-items-center justify-content-end flex-wrap gap-2 mb-3">
        <button className="btn btn-outline-secondary rounded-crm-xs text-13" onClick={handleExport}>
          <i className="bi bi-printer me-1" />Export
        </button>
        <button className="btn-crm" onClick={() => { setCreatePrefill(null); setShowCreate(true); }}>
          <i className="bi bi-plus-lg" />New Report
        </button>
      </div>

      {listLoading ? <LoadingBox /> : (
        <>
          {tab === 'mine' && (
            (listData?.reports ?? []).length === 0
              ? <EmptyState onCreate={() => { setCreatePrefill(null); setShowCreate(true); }} />
              : <div className="row g-3">{listData.reports.map((r) => <ReportCard key={r.id} report={r} onOpen={setOpenReportId} />)}</div>
          )}
          {tab === 'shared' && <SharedTable reports={listData?.reports ?? []} onOpen={setOpenReportId} />}
          {tab === 'templates' && <div className="row g-3">{(listData?.reports ?? []).map((t) => <TemplateCard key={t.key} tpl={t} onUse={handleUseTemplate} />)}</div>}
          {tab === 'scheduled' && <ScheduledTable schedules={listData?.schedules ?? []} />}
        </>
      )}

      {showCreate && (
        <CreateReportModal
          prefill={createPrefill}
          catalog={catalog}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setTab('mine'); refreshAll(); }}
        />
      )}

      <ReportDrawer reportId={openReportId} catalog={catalog} members={members} onClose={() => setOpenReportId(null)} onChanged={refreshAll} />
    </div>
  );
}
