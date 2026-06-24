import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import StatCard from '../../components/common/StatCard.jsx';
import { money } from '../../utils/formatters.js';

export default function MasterDashboardPage() {
  const { data, loading } = useResource('/api/dashboard/master');
  if (loading) return <LoadingBox />;
  const stats = data?.stats ?? {};
  const companies = data?.companies ?? [];
  const rate = (value, total) => total ? `${Math.round((Number(value || 0) / Number(total)) * 100)}%` : '—';
  return (
    <div>
      <div className="mb-4"><h4 className="fw-bold mb-0"><i className="bi bi-buildings me-2 text-brand" />Master Dashboard</h4><div className="text-muted text-12">Combined performance across every company you can access.</div></div>
      <div className="row g-3 mb-4">
        <div className="col-6 col-xl-3"><StatCard title="Companies" value={stats.company_count} icon="buildings" color="primary" /></div>
        <div className="col-6 col-xl-3"><StatCard title="Total Leads" value={stats.total_leads} icon="people" color="success" sub={`${stats.new_today || 0} new today`} /></div>
        <div className="col-6 col-xl-3"><StatCard title="Conversions" value={stats.converted} icon="check2-circle" color="warning" /></div>
        <div className="col-6 col-xl-3"><StatCard title="Revenue" value={money(stats.revenue)} icon="currency-rupee" color="danger" /></div>
      </div>
      <div className="card border-0 shadow-sm"><div className="card-body p-4"><h6 className="fw-bold mb-3">Company comparison</h6>
        {companies.length === 0 ? <p className="text-muted mb-0">No companies available.</p> : <div className="table-responsive"><table className="table align-middle mb-0 crm-table"><thead><tr><th>COMPANY</th><th>LEADS</th><th>CONVERTED</th><th>MESSAGES</th><th>ENGAGED</th><th>REVENUE</th></tr></thead><tbody>{companies.map((company) => <tr key={company.id}><td className="fw-semibold">{company.name}</td><td>{company.total_leads || 0}</td><td>{company.converted || 0} <span className="text-muted text-11">({rate(company.converted, company.total_leads)})</span></td><td>{company.messages_sent || 0}</td><td>{company.engaged || 0} <span className="text-muted text-11">({rate(company.engaged, company.messages_sent)})</span></td><td>{money(company.revenue || 0)}</td></tr>)}</tbody></table></div>}
      </div></div>
    </div>
  );
}
