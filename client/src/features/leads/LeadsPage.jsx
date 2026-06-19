import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import Table from '../../components/common/Table.jsx';
import { formatDate, scoreClass, scoreLabel } from '../../utils/formatters.js';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';

const STATUS_OPTS   = [
  { value:'',            label:'All Status' },
  { value:'new',         label:'New' },
  { value:'contacted',   label:'Contacted' },
  { value:'qualified',   label:'Qualified' },
  { value:'proposal',    label:'Proposal' },
  { value:'negotiation', label:'Negotiation' },
  { value:'won',         label:'Won' },
  { value:'lost',        label:'Lost' },
];
const CATEGORY_OPTS = [
  { value:'',           label:'All Categories' },
  { value:'cold',       label:'Cold' },
  { value:'warm',       label:'Warm' },
  { value:'hot',        label:'Hot' },
  { value:'sales_ready',label:'Sales Ready' },
];

export default function LeadsPage() {
  const navigate = useNavigate();
  const toast    = useToast();
  const [filters, setFilters] = useState({ search:'', status:'', category:'', source_id:'', assigned:'', page:1 });

  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries({ ...filters, limit:50 }).filter(([,v]) => v !== ''))
  ).toString();

  const { data, loading, reload } = useResource(`/api/leads?${qs}`, [filters]);
  const leads   = data?.leads   ?? [];
  const total   = data?.total   ?? 0;
  const sources = data?.sources ?? [];
  const agents  = data?.agents  ?? [];

  const set = (k, v) => setFilters((p) => ({ ...p, [k]: v, page: 1 }));
  const clearAll = () => setFilters({ search:'', status:'', category:'', source_id:'', assigned:'', page:1 });
  const hasFilter = filters.search || filters.status || filters.category || filters.source_id || filters.assigned;

  const handleExport = () => {
    const eq = new URLSearchParams({ search:filters.search, status:filters.status, category:filters.category, source_id:filters.source_id }).toString();
    window.location = `/api/leads/export?${eq}`;
  };

  const columns = [
    { label:'Name', render:(r) => (
      <div>
        <div className="fw-semibold text-13 text-dark">{r.name}</div>
        {r.company && <div className="text-11 text-muted-2">{r.company}</div>}
      </div>
    )},
    { label:'Contact', render:(r) => (
      <div className="text-12 text-muted-2">
        {r.email  && <div><i className="bi bi-envelope me-1" />{r.email}</div>}
        {r.mobile && <div><i className="bi bi-phone me-1" />{r.mobile}</div>}
      </div>
    )},
    { label:'Source', render:(r) => r.source_name
        ? <span className="badge badge-source badge-crm">{r.source_name}</span>
        : <span className="text-muted">—</span>
    },
    { label:'Category', render:(r) => {
      const cat = r.category?.toLowerCase().replace(' ','_');
      return cat
        ? <span className={`badge badge-${cat === 'sales_ready' ? 'sales-ready' : cat} badge-crm text-capitalize`}>{r.category}</span>
        : <span className="text-muted">—</span>;
    }},
    { label:'Status', render:(r) => (
      <span className={`badge badge-${r.status} badge-crm text-capitalize`}>{r.status}</span>
    )},
    { label:'Score', render:(r) => (
      <span className={`badge text-bg-${scoreClass(r.score)} badge-crm`}>{r.score ?? 0}</span>
    )},
    { label:'Added', render:(r) => <span className="text-12 text-muted-2">{formatDate(r.created_at)}</span> },
  ];

  return (
    <>
      {/* Header */}
      <div className="d-flex align-items-center mb-4 gap-2 flex-wrap">
        <h5 className="fw-bold mb-0 me-auto text-brand">
          Leads <span className="badge badge-purple badge-crm ms-1">{total}</span>
        </h5>
        <button className="btn btn-sm btn-outline-secondary rounded-crm-xs text-13" onClick={handleExport}>
          <i className="bi bi-download me-1" />Export CSV
        </button>
        <label className="btn btn-sm btn-outline-secondary rounded-crm-xs text-13 mb-0 cursor-pointer">
          <i className="bi bi-upload me-1" />Import CSV
          <input type="file" accept=".csv" className="d-none" onChange={async (e) => {
            const file = e.target.files[0]; if (!file) return;
            const fd = new FormData(); fd.append('csv', file);
            try { const r = await api.post('/api/leads/import', fd); toast(`Imported ${r.imported} leads`, 'success'); reload(); }
            catch (err) { toast(err.message, 'danger'); }
            e.target.value = '';
          }} />
        </label>
      </div>

      {/* Filters */}
      <div className="card crm-card-sm mb-3">
        <div className="card-body py-2 d-flex gap-2 align-items-center overflow-x-auto flex-nowrap">
          <div className="crm-filter-search flex-shrink-0">
            <i className="bi bi-search crm-filter-icon" />
            <input className="form-control form-control-sm crm-filter-input" placeholder="Search name, email, mobile…"
              value={filters.search} onChange={(e) => set('search', e.target.value)} />
          </div>
          <select className="form-select form-select-sm crm-filter-select w-auto flex-shrink-0 min-w-140" value={filters.status}
            onChange={(e) => set('status', e.target.value)}>
            {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="form-select form-select-sm crm-filter-select w-auto flex-shrink-0 min-w-150" value={filters.category}
            onChange={(e) => set('category', e.target.value)}>
            {CATEGORY_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select className="form-select form-select-sm crm-filter-select w-auto flex-shrink-0 min-w-155" value={filters.source_id}
            onChange={(e) => set('source_id', e.target.value)}>
            <option value="">All Sources</option>
            <option value="none">— No Source —</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="form-select form-select-sm crm-filter-select w-auto flex-shrink-0 min-w-145" value={filters.assigned}
            onChange={(e) => set('assigned', e.target.value)}>
            <option value="">All Agents</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {hasFilter && (
            <button className="btn btn-sm btn-outline-secondary rounded-crm-xs text-12" onClick={clearAll}>
              <i className="bi bi-x-circle me-1" />Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card crm-card-sm">
        {loading ? <LoadingBox /> : leads.length === 0 ? (
          <div className="crm-empty">
            <i className="bi bi-people crm-empty-icon" />
            <div className="crm-empty-title">No leads found</div>
            <div className="crm-empty-sub">Try changing filters or add a new lead</div>
          </div>
        ) : (
          <Table columns={columns} rows={leads} onRow={(r) => navigate(`/leads/${r.id}`)} />
        )}
      </div>
    </>
  );
}
