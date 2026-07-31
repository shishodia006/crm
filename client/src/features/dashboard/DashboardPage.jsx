import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import { usePageTabs } from '../../hooks/usePageTabs.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { money, timeAgo } from '../../utils/formatters.js';

const TABS = [
  { key: 'overview', label: 'Overview',    icon: 'grid-1x2-fill' },
  { key: 'pipeline', label: 'Pipeline',    icon: 'bar-chart-line-fill' },
  { key: 'drip',     label: 'Drip Report', icon: 'star-fill' },
  { key: 'full',     label: 'Full Report', icon: 'file-earmark-text-fill' },
];

const STAGE_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#f97316', '#22c55e', '#8b5cf6'];
const slug = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, '-');
const pctStr = (n) => (n == null ? '—' : `${n}%`);

function Delta({ value, invert = false }) {
  if (value == null) return null;
  const up = invert ? value < 0 : value > 0;
  return (
    <span className={`crm-stat-top-delta ${up ? 'up' : 'down'}`}>
      <i className={`bi bi-arrow-${value >= 0 ? 'up' : 'down'}`} />
      {Math.abs(value)}%
    </span>
  );
}

function StatTop({ accent, label, value, delta, invert, sub }) {
  return (
    <div className="card crm-stat-top h-100" style={{ '--stat-accent': accent }}>
      <div className="card-body p-3">
        <div className="d-flex align-items-start justify-content-between">
          <div className="crm-stat-top-value">{value}</div>
          <Delta value={delta} invert={invert} />
        </div>
        <div className="crm-stat-top-label">{label}</div>
        {sub && <div className="crm-stat-top-sub">{sub}</div>}
      </div>
    </div>
  );
}

function Gauge({ score }) {
  return (
    <div className="crm-gauge" style={{ '--gauge-pct': score * 10 }}>
      <div className="crm-gauge-inner">{score}</div>
    </div>
  );
}

function ActionRow({ item }) {
  const accent = { Stalled: '#ef4444', Overdue: '#ef4444', Waiting: '#f59e0b', Pending: '#6366f1', 'On Track': '#22c55e' }[item.badge] || '#d1d5db';
  return (
    <div className="crm-action-row" style={{ '--action-accent': accent }}>
      <div className="min-w-0">
        <div className="crm-action-name text-truncate">{item.name}</div>
        <div className="crm-action-sub text-truncate">{item.reason}</div>
      </div>
      <div className="text-end flex-shrink-0">
        {item.kind === 'lead'
          ? <div className="crm-action-value text-muted-3 text-11">No deal yet</div>
          : <div className="crm-action-value">{money(item.value)}</div>}
        <span className={`badge badge-crm badge-${slug(item.badge)}`}>{item.badge}</span>
      </div>
    </div>
  );
}

function FunnelTable({ funnel, compact = false }) {
  return (
    <div className="table-responsive">
      <table className="table align-middle mb-0 crm-table">
        <thead>
          <tr>
            <th>Stage</th><th>Count</th><th>Conversion</th>
            {!compact && <th>vs Last Month</th>}
            {!compact && <th>Health</th>}
          </tr>
        </thead>
        <tbody>
          {funnel.map((f) => (
            <tr key={f.stage}>
              <td className="fw-semibold text-dark">{f.stage}</td>
              <td>{f.count}</td>
              <td>{pctStr(f.conversionPct)}</td>
              {!compact && (
                <td className={f.vsLastMonthPct == null ? 'text-muted-3' : f.vsLastMonthPct >= 0 ? 'icon-green' : 'text-danger'}>
                  {f.vsLastMonthPct == null ? '—' : `${f.vsLastMonthPct >= 0 ? '↑' : '↓'} ${Math.abs(f.vsLastMonthPct)}%`}
                </td>
              )}
              {!compact && <td><span className={`badge badge-crm badge-${slug(f.health)}`}>{f.health}</span></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PipelineSnapshot({ funnel }) {
  const max = Math.max(...funnel.map((f) => f.count), 1);
  return (
    <div>
      {funnel.map((f, i) => (
        <div key={f.stage} className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span className="fw-semibold text-13 text-gray-700">{f.stage}</span>
            <span className="fw-bold text-13">{f.count}</span>
          </div>
          <div className="crm-progress">
            <div className="crm-progress-fill" style={{ width: `${Math.round((f.count / max) * 100)}%`, background: STAGE_COLORS[i % STAGE_COLORS.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function BusinessHealthCard({ health }) {
  const rows = [
    { label: 'Lead Magnet', value: health.subScores.leadMagnet },
    { label: 'Management', value: health.subScores.management },
    { label: 'Conversion', value: health.subScores.conversion },
  ];
  return (
    <div className="d-flex align-items-center gap-4">
      <Gauge score={health.score} />
      <div className="flex-grow-1 min-w-0">
        {rows.map((r) => (
          <div key={r.label} className="mb-2">
            <div className="d-flex justify-content-between text-12 mb-1">
              <span className="text-gray-700">{r.label}</span>
              <span className="fw-semibold">{r.value}</span>
            </div>
            <div className="crm-progress">
              <div className="crm-progress-fill" style={{ width: `${r.value * 10}%`, background: '#4d50d8' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GoalBar({ label, goal, format = (n) => n }) {
  if (!goal.target) {
    return (
      <div className="mb-3">
        <div className="text-13 fw-semibold text-gray-700 mb-1">{label}</div>
        <div className="text-11 text-muted-3">Set a target in Settings → General to track this goal.</div>
      </div>
    );
  }
  return (
    <div className="mb-3">
      <div className="d-flex justify-content-between text-13 mb-1">
        <span className="fw-semibold text-gray-700">{label}</span>
        <span className="text-muted-3">{format(goal.actual)} / {format(goal.target)}</span>
      </div>
      <div className="crm-progress">
        <div className="crm-progress-fill" style={{ width: `${goal.pct}%`, background: goal.pct >= 100 ? '#22c55e' : '#4d50d8' }} />
      </div>
    </div>
  );
}

function ActivityFeed({ items }) {
  if (!items.length) return <p className="text-muted text-center py-4 mb-0">No recent activity.</p>;
  return (
    <div>
      {items.map((a, i) => (
        <div key={i} className="crm-activity-item">
          <span className={`crm-activity-icon ${a.color}`}><i className={`bi bi-${a.icon}`} /></span>
          <div className="flex-grow-1 min-w-0">
            <div className="crm-activity-text text-truncate">{a.text}</div>
            <div className="crm-activity-time">{timeAgo(a.time)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Overview ────────────────────────────────────────── */
function OverviewTab({ o }) {
  const s = o.stats;
  return (
    <div>
      <div className="row g-3 mb-4">
        <div className="col-6 col-xl-3">
          <StatTop accent="#7c3aed" label="Total Pipeline Value" value={money(s.pipelineValue)} delta={s.pipelineValueTrendPct} />
        </div>
        <div className="col-6 col-xl-3">
          <StatTop accent="#22c55e" label="Deals Won This Month" value={s.dealsWonThisMonth}
            delta={s.dealsWonLastMonth ? Math.round(((s.dealsWonThisMonth - s.dealsWonLastMonth) / s.dealsWonLastMonth) * 100) : null}
            sub={o.monthlyGoals.deals.target ? `Goal ${o.monthlyGoals.deals.target} deals · ${o.monthlyGoals.deals.pct}% there` : null} />
        </div>
        <div className="col-6 col-xl-3">
          <StatTop accent="#f59e0b" label="Lead-to-Close Rate" value={`${s.closeRate}%`} delta={s.closeRateTrendPct} invert
            sub={`Industry avg ${s.industryCloseRate}% — gap to close`} />
        </div>
        <div className="col-6 col-xl-3">
          <StatTop accent="#ef4444" label="Leads Needing Action" value={s.leadsNeedingAction}
            sub={`${money(s.leadsAtRiskValue)} potential at risk today`} />
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-4">
          <div className="card crm-card h-100"><div className="card-body p-4">
            <h6 className="fw-bold mb-3 text-brand">Pipeline Snapshot</h6>
            <PipelineSnapshot funnel={o.funnel} />
          </div></div>
        </div>
        <div className="col-lg-4">
          <div className="card crm-card h-100"><div className="card-body p-4">
            <h6 className="fw-bold mb-3 text-brand">Business Health</h6>
            <BusinessHealthCard health={o.businessHealth} />
          </div></div>
        </div>
        <div className="col-lg-4">
          <div className="card crm-card h-100"><div className="card-body p-4">
            <h6 className="fw-bold mb-3 text-brand">Today's Priority</h6>
            {o.actionRequired.length === 0
              ? <p className="text-muted text-center py-4 mb-0">Nothing needs attention right now.</p>
              : o.actionRequired.slice(0, 4).map((item) => <ActionRow key={item.id} item={item} />)}
          </div></div>
        </div>
      </div>
    </div>
  );
}

/* ── Pipeline ────────────────────────────────────────── */
function PipelineTab({ o }) {
  const insights = [];
  const bottleneck = o.funnel.find((f) => f.health === 'Bottleneck');
  if (bottleneck) {
    const atRisk = Number(bottleneck.value || 0);
    insights.push({ type: 'warning', text: `${bottleneck.stage} is your biggest drop-off (${pctStr(bottleneck.conversionPct)} conversion).` });
    if (atRisk > 0) insights.push({ type: 'info', text: `Fixing this bottleneck could unlock ~${money(atRisk)} stuck in pipeline.` });
  }
  if (o.leadSourceInsight) insights.push({ type: 'positive', text: o.leadSourceInsight });

  return (
    <div>
      <div className="row g-4 mb-4">
        <div className="col-12">
          <div className="card crm-card"><div className="card-body p-4">
            <h6 className="fw-bold mb-3 text-brand">Revenue Funnel</h6>
            <FunnelTable funnel={o.funnel} />
          </div></div>
        </div>
        {insights.length > 0 && (
          <div className="col-12 d-flex flex-column flex-md-row gap-2">
            {insights.map((ins, i) => <div key={i} className={`crm-insight-banner ${ins.type} flex-grow-1`}><i className="bi bi-lightbulb-fill" />{ins.text}</div>)}
          </div>
        )}
      </div>

      <div className="row g-4">
        <div className="col-lg-4">
          <div className="card crm-card h-100"><div className="card-body p-4">
            <h6 className="fw-bold mb-3 text-brand">Lead Sources</h6>
            <div className="crm-source-list">
              <table className="table table-sm mb-0 crm-table">
                <tbody>
                  {o.leadSources.map((src) => (
                    <tr key={src.name}>
                      <td className="text-gray-700">{src.name}</td>
                      <td className="text-end fw-semibold">{src.total}</td>
                      <td className={`text-end text-11 ${src.trendPct == null ? 'text-muted-3' : src.trendPct >= 0 ? 'icon-green' : 'text-danger'}`}>
                        {src.trendPct == null ? '—' : `${src.trendPct >= 0 ? '↑' : '↓'} ${Math.abs(src.trendPct)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div></div>
        </div>

        <div className="col-lg-4">
          <div className="card crm-card h-100"><div className="card-body p-4">
            <h6 className="fw-bold mb-3 text-brand">Monthly Goal</h6>
            <GoalBar label="Revenue Closed" goal={o.monthlyGoals.revenue} format={money} />
            <GoalBar label="Deals Won" goal={o.monthlyGoals.deals} />
            <GoalBar label="New Leads" goal={o.monthlyGoals.leads} />
            <GoalBar label="Demos Booked" goal={o.monthlyGoals.demos} />
            {o.monthlyGoals.pace && <div className="crm-insight-banner warning mt-2">{o.monthlyGoals.pace}</div>}
          </div></div>
        </div>

        <div className="col-lg-4">
          <div className="card crm-card h-100"><div className="card-body p-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="fw-bold mb-0 text-brand">Action Required</h6>
              {o.actionRequired.length > 0 && <span className="badge badge-crm badge-overdue">{o.stats.leadsNeedingAction}</span>}
            </div>
            {o.actionRequired.length === 0
              ? <p className="text-muted text-center py-4 mb-0">All clear.</p>
              : o.actionRequired.slice(0, 6).map((item) => <ActionRow key={item.id} item={item} />)}
          </div></div>
        </div>
      </div>
    </div>
  );
}

/* ── Drip Report ─────────────────────────────────────── */
function DripTab({ o }) {
  const d = o.drip;
  return (
    <div>
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3"><div className="card crm-kpi h-100"><div className="card-body p-4 text-center">
          <div className="crm-kpi-value">{d.totals.enrolled}</div><div className="crm-kpi-label">Total Enrolled</div>
        </div></div></div>
        <div className="col-6 col-md-3"><div className="card crm-kpi h-100"><div className="card-body p-4 text-center">
          <div className="crm-kpi-value">{d.totals.avgOpenRate}%</div><div className="crm-kpi-label">Avg Open Rate</div>
        </div></div></div>
        <div className="col-6 col-md-3"><div className="card crm-kpi h-100"><div className="card-body p-4 text-center">
          <div className="crm-kpi-value">{d.totals.avgClickRate}%</div><div className="crm-kpi-label">Avg Click Rate</div>
        </div></div></div>
        <div className="col-6 col-md-3"><div className="card crm-kpi h-100"><div className="card-body p-4 text-center">
          <div className="crm-kpi-value">{d.totals.converted}</div><div className="crm-kpi-label">Drip Conversions</div>
        </div></div></div>
      </div>

      {d.campaigns.length === 0 ? (
        <div className="card crm-card"><div className="card-body p-4"><p className="text-muted text-center mb-0">No active sequences.</p></div></div>
      ) : (
        <div className="row g-3">
          {d.campaigns.map((c) => (
            <div key={c.id} className="col-lg-6">
              <div className="card crm-sequence-card h-100"><div className="card-body p-4">
                <div className="d-flex justify-content-between align-items-start mb-3">
                  <h6 className="fw-bold mb-0 text-brand">{c.name}</h6>
                  <span className="badge badge-crm badge-active">Active</span>
                </div>
                <div className="row g-2 text-center mb-3">
                  <div className="col-3"><div className="fw-bold text-16">{c.enrolled}</div><div className="text-11 text-muted-3">Enrolled</div></div>
                  <div className="col-3"><div className="fw-bold text-16">{c.openRate}%</div><div className="text-11 text-muted-3">Open Rate</div></div>
                  <div className="col-3"><div className="fw-bold text-16">{c.clickRate}%</div><div className="text-11 text-muted-3">Click Rate</div></div>
                  <div className="col-3"><div className="fw-bold text-16 icon-green">{c.converted}</div><div className="text-11 text-muted-3">Converted</div></div>
                </div>
                {c.steps.map((step) => (
                  <div key={step.label} className="mb-2">
                    <div className="d-flex justify-content-between crm-sequence-step-label mb-1">
                      <span>{step.label}</span><span>{step.openRate}%</span>
                    </div>
                    <div className="crm-progress"><div className="crm-progress-fill" style={{ width: `${step.openRate}%`, background: '#4d50d8' }} /></div>
                  </div>
                ))}
                {c.insight && (
                  <div className={`crm-insight-banner ${c.insight.includes('Lowest') ? 'warning' : 'positive'} mt-2`}>
                    <i className="bi bi-lightbulb-fill" />{c.insight}
                  </div>
                )}
              </div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Full Report ─────────────────────────────────────── */
function FullReportTab({ o }) {
  const s = o.stats;
  return (
    <div>
      <div className="row g-3 mb-4">
        <div className="col-6 col-xl-3"><StatTop accent="#7c3aed" label="Pipeline Value" value={money(s.pipelineValue)} delta={s.pipelineValueTrendPct} /></div>
        <div className="col-6 col-xl-3"><StatTop accent="#22c55e" label="Deals Won" value={s.dealsWonThisMonth} /></div>
        <div className="col-6 col-xl-3"><StatTop accent="#f59e0b" label="Close Rate" value={`${s.closeRate}%`} delta={s.closeRateTrendPct} invert /></div>
        <div className="col-6 col-xl-3"><StatTop accent="#0ea5e9" label="Drip Open Rate" value={`${o.drip.totals.avgOpenRate}%`} /></div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-lg-7">
          <div className="card crm-card"><div className="card-body p-4">
            <h6 className="fw-bold mb-3 text-brand">Revenue Funnel</h6>
            <FunnelTable funnel={o.funnel} compact />
          </div></div>
        </div>
        <div className="col-lg-5">
          <div className="card crm-card h-100"><div className="card-body p-4">
            <h6 className="fw-bold mb-3 text-brand">Business Health</h6>
            <BusinessHealthCard health={o.businessHealth} />
          </div></div>
        </div>
      </div>

      <div className="row g-3">
        <div className="col-lg-6">
          <div className="card crm-card h-100"><div className="card-body p-4">
            <h6 className="fw-bold mb-3 text-brand">Drip Summary</h6>
            {o.drip.campaigns.length === 0
              ? <p className="text-muted text-center py-4 mb-0">No active sequences.</p>
              : o.drip.campaigns.map((c) => (
                <div key={c.id} className="d-flex justify-content-between align-items-center py-2 border-bottom">
                  <span className="fw-semibold text-13">{c.name}</span>
                  <span className="text-12 text-muted-3">{c.enrolled} enrolled · <span className="icon-amber">{c.openRate}% open</span> · {c.converted} converted</span>
                </div>
              ))}
          </div></div>
        </div>
        <div className="col-lg-6">
          <div className="card crm-card h-100"><div className="card-body p-4">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h6 className="fw-bold mb-0 text-brand">Live Activity</h6>
              <span className="badge badge-crm badge-active">Live</span>
            </div>
            <ActivityFeed items={o.liveActivity} />
          </div></div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────── */
export default function DashboardPage() {
  const [tab, setTab] = useState('overview');
  usePageTabs(TABS, tab, setTab);
  const { data, loading } = useResource('/api/dashboard');

  if (loading) return <LoadingBox />;
  const o = data?.overview;
  if (!o) return <p className="text-muted">Could not load dashboard data.</p>;

  return (
    <div>
      {tab === 'overview' && <OverviewTab o={o} />}
      {tab === 'pipeline' && <PipelineTab o={o} />}
      {tab === 'drip'     && <DripTab o={o} />}
      {tab === 'full'     && <FullReportTab o={o} />}
    </div>
  );
}
