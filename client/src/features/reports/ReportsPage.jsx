import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import ChartCanvas from '../../components/charts/ChartCanvas.jsx';
import { money, formatDate } from '../../utils/formatters.js';

const TABS = [
  { key: 'funnel',  label: 'Lead Funnel',      icon: 'filter-circle-fill' },
  { key: 'drip',    label: 'Drip Report',       icon: 'lightning-charge-fill' },
  { key: 'revenue', label: 'Revenue Report',    icon: 'currency-rupee' },
  { key: 'agents',  label: 'Agent Performance', icon: 'people-fill' },
];

const CH_ICON = { email: 'envelope-fill', whatsapp: 'whatsapp', sms: 'phone-fill', rcs: 'chat-dots-fill' };

function KpiCard({ label, value, sub, iconClass = 'text-purple', icon }) {
  return (
    <div className="card crm-kpi h-100">
      <div className="card-body p-4 text-center">
        {icon && <i className={`bi bi-${icon} crm-kpi-icon ${iconClass}`} />}
        <div className="crm-kpi-value">{value}</div>
        <div className="crm-kpi-label">{label}</div>
        {sub && <div className="crm-kpi-sub">{sub}</div>}
      </div>
    </div>
  );
}

/* ── FUNNEL REPORT ───────────────────────────────────── */
function FunnelReport({ data }) {
  const funnel = data?.leadFunnel ?? [];
  const stages = data?.stages    ?? [];
  const total  = data?.totalLeads ?? 0;
  const maxCount = Math.max(...funnel.map((r) => Number(r.cnt)), 1);

  return (
    <div>
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <KpiCard label="Total Leads" value={total} icon="people-fill" iconClass="icon-indigo" />
        </div>
        <div className="col-6 col-md-3">
          <KpiCard label="Won" value={data?.totalWon ?? 0} icon="trophy-fill" iconClass="icon-green" />
        </div>
        <div className="col-6 col-md-3">
          <KpiCard label="Conversion Rate" value={`${data?.convRate ?? 0}%`} icon="graph-up-arrow" iconClass="icon-amber" />
        </div>
        <div className="col-6 col-md-3">
          <KpiCard label="Pipeline Stages" value={stages.length} icon="kanban-fill" iconClass="text-purple" />
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-7">
          <div className="card crm-card">
            <div className="card-body p-4">
              <h6 className="fw-bold mb-4 text-brand">
                <i className="bi bi-filter-circle me-2 text-purple" />Lead Status Funnel
              </h6>
              {funnel.length === 0
                ? <p className="text-muted text-center py-4">No lead data.</p>
                : funnel.map((r) => {
                  const pct = Math.round((Number(r.cnt) / maxCount) * 100);
                  return (
                    <div key={r.status} className="mb-3">
                      <div className="d-flex justify-content-between align-items-center mb-1">
                        <span className="fw-semibold text-capitalize text-13 text-gray-700">{r.status}</span>
                        <span className={`fw-bold text-13 text-status-${r.status}`}>{r.cnt}</span>
                      </div>
                      <div className="crm-progress">
                        <div className={`crm-progress-fill fill-${r.status}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
              }
            </div>
          </div>
        </div>

        <div className="col-lg-5">
          <div className="card crm-card">
            <div className="card-body p-4">
              <h6 className="fw-bold mb-4 text-brand">
                <i className="bi bi-kanban me-2 text-purple" />Pipeline Stages
              </h6>
              {stages.length === 0
                ? <p className="text-muted text-center py-4">No pipeline data.</p>
                : (
                  <table className="table table-sm align-middle mb-0 crm-table">
                    <thead>
                      <tr>
                        <th>Stage</th>
                        <th>Deals</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stages.map((s) => (
                        <tr key={s.name}>
                          <td className="fw-semibold text-dark">{s.name}</td>
                          <td><span className="badge badge-crm badge-purple">{s.deals}</span></td>
                          <td className="text-revenue">{money(s.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── DRIP REPORT ─────────────────────────────────────── */
function DripReport({ data }) {
  const campaigns    = data?.campaigns   ?? [];
  const channelStats = data?.channelStats ?? [];
  const chMap    = Object.fromEntries(channelStats.map((c) => [c.channel, c]));
  const channels = ['email', 'whatsapp', 'sms', 'rcs'];

  return (
    <div>
      {/* Channel cards */}
      <div className="row g-3 mb-4">
        {channels.map((ch) => {
          const s    = chMap[ch] ?? { sent: 0, delivered: 0 };
          const sent = Number(s.sent ?? 0);
          const del  = Number(s.delivered ?? 0);
          const pct  = sent > 0 ? Math.round((del / sent) * 100) : 0;
          return (
            <div key={ch} className="col-6 col-md-3">
              <div className="card crm-card text-center">
                <div className="card-body p-4">
                  <i className={`bi bi-${CH_ICON[ch]} crm-kpi-icon crm-ch-icon-${ch}`} />
                  <div className="fw-bold text-uppercase ls-wide text-12 text-gray-700">{ch}</div>
                  <div className="crm-kpi-value">{sent}</div>
                  <div className="text-11 text-muted-3">Sent (30 days)</div>
                  <div className="crm-divider" />
                  <div className={`text-12 fw-bold ${pct > 0 ? 'icon-green' : 'text-muted-3'}`}>{pct}% delivered</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Campaign table */}
      <div className="card crm-card">
        <div className="card-body p-4">
          <h6 className="fw-bold mb-4 text-brand">
            <i className="bi bi-lightning-charge me-2 text-purple" />Campaign Performance
          </h6>
          {campaigns.length === 0
            ? <p className="text-muted text-center py-4">No campaigns yet.</p>
            : (
              <div className="table-responsive">
                <table className="table align-middle mb-0 crm-table">
                  <thead>
                    <tr>
                      {['Campaign','Status','Enrolled','Active','Completed','Converted','Msgs Sent','Opens','Clicks','WA Reads'].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c, i) => {
                      const opens   = Number(c.opens ?? 0);
                      const msgs    = Number(c.messages_sent ?? 0);
                      const openPct = msgs > 0 ? Math.round((opens / msgs) * 100) : 0;
                      return (
                        <tr key={i}>
                          <td className="fw-semibold text-dark">{c.name}</td>
                          <td><span className={`badge badge-crm badge-${c.status ?? 'draft'}`}>{c.status}</span></td>
                          <td>{c.enrolled ?? 0}</td>
                          <td>{c.active ?? 0}</td>
                          <td>{c.completed ?? 0}</td>
                          <td className={c.converted > 0 ? 'fw-bold icon-green' : ''}>{c.converted ?? 0}</td>
                          <td>{msgs}</td>
                          <td>{opens} <span className="text-11 text-muted-3">({openPct}%)</span></td>
                          <td>{c.clicks ?? 0}</td>
                          <td>{c.wa_reads ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}

/* ── REVENUE REPORT ──────────────────────────────────── */
function RevenueReport({ data }) {
  const monthly    = data?.monthly    ?? [];
  const bySource   = data?.bySource   ?? [];
  const byCampaign = data?.byCampaign ?? [];

  const chartData = {
    labels: monthly.map((r) => r.month),
    datasets: [{ label: 'Revenue (₹)', data: monthly.map((r) => Number(r.revenue)), backgroundColor: 'rgba(124,58,237,0.7)', borderRadius: 6 }],
  };

  return (
    <div>
      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <KpiCard label="Total Revenue" value={money(data?.totalRevenue)} icon="cash-stack" iconClass="icon-green" />
        </div>
        <div className="col-md-3">
          <KpiCard label={`YTD Revenue (${new Date().getFullYear()})`} value={money(data?.ytd)} icon="calendar-check" iconClass="text-purple" />
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-8">
          <div className="card crm-card">
            <div className="card-body p-4">
              <h6 className="fw-bold mb-3 text-brand">Monthly Revenue (Last 12 Months)</h6>
              {monthly.length === 0
                ? <p className="text-muted text-center py-4">No revenue data.</p>
                : <ChartCanvas type="bar" data={chartData} height={240} />
              }
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card crm-card">
            <div className="card-body p-4">
              <h6 className="fw-bold mb-3 text-brand">By Lead Source</h6>
              <div className="crm-source-list">
                <table className="table table-sm mb-0 crm-table">
                  <tbody>
                    {bySource.map((r) => (
                      <tr key={r.name}>
                        <td className="text-gray-700">{r.name}</td>
                        <td className={`text-end fw-semibold ${Number(r.revenue) > 0 ? 'icon-green' : 'text-muted-3'}`}>
                          {money(r.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {byCampaign.length > 0 && (
          <div className="col-12">
            <div className="card crm-card">
              <div className="card-body p-4">
                <h6 className="fw-bold mb-3 text-brand">By Campaign (Top 10)</h6>
                <table className="table table-sm align-middle mb-0 crm-table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Deals</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCampaign.map((r) => (
                      <tr key={r.name}>
                        <td className="fw-semibold">{r.name}</td>
                        <td>{r.deals}</td>
                        <td className="text-revenue">{money(r.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── AGENTS REPORT ───────────────────────────────────── */
function AgentsReport({ data }) {
  const agents = data?.agents ?? [];

  return (
    <div>
      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <KpiCard label="Total Agents" value={agents.length} icon="person-badge-fill" iconClass="icon-indigo" />
        </div>
        <div className="col-md-3">
          <KpiCard label="Total Leads" value={agents.reduce((s, a) => s + Number(a.leads_assigned), 0)} icon="people-fill" iconClass="icon-sky" />
        </div>
        <div className="col-md-3">
          <KpiCard label="Total Conversions" value={agents.reduce((s, a) => s + Number(a.conversions), 0)} icon="trophy-fill" iconClass="icon-green" />
        </div>
        <div className="col-md-3">
          <KpiCard label="Total Revenue" value={money(agents.reduce((s, a) => s + Number(a.revenue), 0))} icon="cash-stack" iconClass="text-purple" />
        </div>
      </div>

      <div className="card crm-card">
        <div className="card-body p-4">
          <h6 className="fw-bold mb-4 text-brand">
            <i className="bi bi-people me-2 text-purple" />Agent Performance
          </h6>
          {agents.length === 0
            ? <p className="text-muted text-center py-4">No agents found.</p>
            : (
              <div className="table-responsive">
                <table className="table align-middle mb-0 crm-table">
                  <thead>
                    <tr>
                      {['Agent','Role','Leads Assigned','Contacted','Conversions','Conv %','Calls','Meetings','Open Tasks','Revenue'].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <span className="crm-agent-avatar">{a.name?.charAt(0)?.toUpperCase()}</span>
                            <span className="fw-semibold text-dark">{a.name}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`badge badge-crm badge-${a.role}`}>{a.role}</span>
                        </td>
                        <td>{a.leads_assigned}</td>
                        <td>{a.leads_contacted}</td>
                        <td className="fw-bold icon-green">{a.conversions}</td>
                        <td>
                          <span className={`badge badge-crm ${Number(a.conv_rate) >= 20 ? 'badge-conv-high' : Number(a.conv_rate) >= 10 ? 'badge-conv-mid' : 'badge-conv-low'}`}>
                            {a.conv_rate ?? 0}%
                          </span>
                        </td>
                        <td>{a.calls}</td>
                        <td>{a.meetings}</td>
                        <td className={a.open_tasks > 5 ? 'text-danger fw-bold' : 'text-brand'}>
                          {a.open_tasks}
                        </td>
                        <td className="text-revenue">{money(a.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────── */
export default function ReportsPage() {
  const [tab, setTab]           = useState('funnel');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const qs = new URLSearchParams({ date_from: dateFrom, date_to: dateTo }).toString();
  const { data, loading } = useResource(`/api/reports/${tab}?${qs}`, [tab, dateFrom, dateTo]);

  return (
    <div>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-4">
        <h5 className="fw-bold mb-0 text-brand">Reports</h5>
        <div className="d-flex gap-2">
          <input type="date" className="form-control form-control-sm crm-input max-w-150"
            value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" className="form-control form-control-sm crm-input max-w-150"
            value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {/* Tab strip */}
      <div className="crm-tabs mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`crm-tab${tab === t.key ? ' active' : ''}`}
          >
            <i className={`bi bi-${t.icon}`} />
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingBox /> : (
        <>
          {tab === 'funnel'  && <FunnelReport  data={data} />}
          {tab === 'drip'    && <DripReport    data={data} />}
          {tab === 'revenue' && <RevenueReport data={data} />}
          {tab === 'agents'  && <AgentsReport  data={data} />}
        </>
      )}
    </div>
  );
}
