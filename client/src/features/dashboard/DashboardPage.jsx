import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import StatCard from '../../components/common/StatCard.jsx';
import ChartCanvas from '../../components/charts/ChartCanvas.jsx';
import { money, formatDate } from '../../utils/formatters.js';

export default function DashboardPage() {
  const { data, loading } = useResource('/api/dashboard');
  const { data: daily } = useResource('/api/stats/daily');

  if (loading) return <LoadingBox />;

  const s = data?.stats ?? {};
  const recentLeads = data?.recentLeads ?? [];
  const pendingTasks = data?.pendingTasks ?? [];
  const funnelStats = data?.funnelStats ?? [];
  const dailyRows = daily?.rows ?? [];

  const chartData = {
    labels: dailyRows.map((r) => formatDate(r.date, { month: 'short', day: '2-digit' })),
    datasets: [
      {
        label: 'Leads',
        data: dailyRows.map((r) => r.total),
        borderColor: '#0d6efd',
        backgroundColor: 'rgba(13,110,253,0.1)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  const funnelChart = {
    labels: funnelStats.map((r) => r.stage),
    datasets: [{
      label: 'Deals',
      data: funnelStats.map((r) => r.total),
      backgroundColor: ['#0d6efd','#0dcaf0','#198754','#ffc107','#fd7e14','#20c997'],
    }]
  };

  return (
    <>
      <div className="d-flex align-items-center mb-4">
        <h4 className="fw-bold mb-0">Dashboard</h4>
      </div>

      {/* Stat cards */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-xl-3">
          <StatCard title="Total Leads" value={s.total_leads} icon="people" color="primary" sub={`${s.new_today ?? 0} new today`} />
        </div>
        <div className="col-6 col-xl-3">
          <StatCard title="Hot Leads" value={s.hot_leads} icon="fire" color="danger" />
        </div>
        <div className="col-6 col-xl-3">
          <StatCard title="Active Campaigns" value={s.active_campaigns} icon="megaphone" color="success" />
        </div>
        <div className="col-6 col-xl-3">
          <StatCard title="Revenue (YTD)" value={money(s.revenue)} icon="currency-rupee" color="warning" />
        </div>
      </div>

      {/* Charts row */}
      <div className="row g-3 mb-4">
        <div className="col-lg-8">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <h6 className="card-title fw-semibold mb-3">Lead Trend (30 days)</h6>
              {dailyRows.length === 0
                ? <p className="text-muted small text-center py-4">No lead data for this period.</p>
                : <ChartCanvas type="line" data={chartData} height={220} />
              }
            </div>
          </div>
        </div>
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <h6 className="card-title fw-semibold mb-3">Pipeline Funnel</h6>
              {funnelStats.length === 0
                ? <p className="text-muted small text-center py-4">No pipeline data.</p>
                : <ChartCanvas type="doughnut" data={funnelChart} height={220} />
              }
            </div>
          </div>
        </div>
      </div>

      {/* Recent leads + pending tasks */}
      <div className="row g-3">
        <div className="col-lg-8">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <h6 className="card-title fw-semibold mb-3">Recent Leads</h6>
              {recentLeads.length === 0
                ? <p className="text-muted small">No leads yet.</p>
                : (
                  <div className="table-responsive">
                    <table className="table table-sm align-middle mb-0">
                      <thead className="table-light">
                        <tr><th>Name</th><th>Contact</th><th>Source</th><th>Score</th><th>Added</th></tr>
                      </thead>
                      <tbody>
                        {recentLeads.map((l) => (
                          <tr key={l.id}>
                            <td className="fw-semibold text-13">{l.name}</td>
                            <td className="text-muted text-12">{l.email || l.mobile}</td>
                            <td className="text-12">{l.source_name}</td>
                            <td><span className="badge bg-secondary">{l.score ?? 0}</span></td>
                            <td className="text-12">{formatDate(l.created_at)}</td>
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

        <div className="col-lg-4">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <h6 className="card-title fw-semibold mb-3">
                Pending Tasks
                <span className="badge bg-warning text-dark ms-2">{s.pending_tasks ?? 0}</span>
              </h6>
              {pendingTasks.length === 0
                ? <p className="text-muted small">No pending tasks.</p>
                : (
                  <ul className="list-unstyled mb-0">
                    {pendingTasks.map((t) => (
                      <li key={t.id} className="d-flex gap-2 align-items-start py-2 border-bottom">
                        <i className="bi bi-check2-square text-warning mt-1 flex-shrink-0" />
                        <div>
                          <div className="text-13">{t.title}</div>
                          {t.lead_name && <div className="text-muted text-11">{t.lead_name}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              }
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
