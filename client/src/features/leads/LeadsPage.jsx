import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import Table from '../../components/common/Table.jsx';
import { formatDate, scoreClass } from '../../utils/formatters.js';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';

const STATUS_OPTS = [
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
  { value:'',            label:'All Categories' },
  { value:'cold',        label:'Cold' },
  { value:'warm',        label:'Warm' },
  { value:'hot',         label:'Hot' },
  { value:'sales_ready', label:'Sales Ready' },
];
const LIMIT_OPTS = [10, 20, 50, 100];

function pageRange(current, last) {
  const pages = [];
  const delta = 2;
  let prev = null;
  for (let i = 1; i <= last; i++) {
    if (i === 1 || i === last || (i >= current - delta && i <= current + delta)) {
      if (prev && i - prev > 1) pages.push('…');
      pages.push(i);
      prev = i;
    }
  }
  return pages;
}

export default function LeadsPage() {
  const navigate = useNavigate();
  const toast    = useToast();
  const [filters, setFilters] = useState({
    search: '', status: '', category: '', source_id: '', assigned: '', page: 1, limit: 25,
  });

  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))
  ).toString();

  const { data, loading, reload } = useResource(`/api/leads?${qs}`, [filters], 30000);
  const leads      = data?.leads                  ?? [];
  const total      = data?.pagination?.total      ?? 0;
  const lastPage   = data?.pagination?.last_page  ?? 1;
  const sources    = data?.sources           ?? [];
  const agents     = data?.agents            ?? [];

  const set     = (k, v) => setFilters((p) => ({ ...p, [k]: v, page: 1 }));
  const setPage = (p)    => setFilters((f) => ({ ...f, page: p }));
  const clearAll = ()    => setFilters({ search: '', status: '', category: '', source_id: '', assigned: '', page: 1, limit: filters.limit });
  const hasFilter = filters.search || filters.status || filters.category || filters.source_id || filters.assigned;

  const handleExport = () => {
    const eq = new URLSearchParams({ search: filters.search, status: filters.status, category: filters.category, source_id: filters.source_id }).toString();
    window.location = `/api/leads/export?${eq}`;
  };

  const columns = [
    { label: 'Name', render: (r) => (
      <div>
        <div className="fw-semibold text-13 text-dark">{r.name}</div>
        {r.company && <div className="text-11 text-muted-2">{r.company}</div>}
      </div>
    )},
    { label: 'Contact', render: (r) => (
      <div className="text-12 text-muted-2">
        {r.email  && <div><i className="bi bi-envelope me-1" />{r.email}</div>}
        {r.mobile && <div><i className="bi bi-phone me-1" />{r.mobile}</div>}
      </div>
    )},
    { label: 'Source', render: (r) => r.source_name
        ? <span className="badge badge-source badge-crm">{r.source_name}</span>
        : <span className="text-muted">—</span>
    },
    { label: 'Category', render: (r) => {
      const cat = r.category?.toLowerCase().replace(' ', '_');
      return cat
        ? <span className={`badge badge-${cat === 'sales_ready' ? 'sales-ready' : cat} badge-crm text-capitalize`}>{r.category}</span>
        : <span className="text-muted">—</span>;
    }},
    { label: 'Status', render: (r) => (
      <span className={`badge badge-${r.status} badge-crm text-capitalize`}>{r.status}</span>
    )},
    { label: 'Score', render: (r) => (
      <span className={`badge text-bg-${scoreClass(r.score)} badge-crm`}>{r.score ?? 0}</span>
    )},
    { label: 'Added', render: (r) => <span className="text-12 text-muted-2">{formatDate(r.created_at)}</span> },
    { label: 'Email', render: (r) => {
      const sent    = Number(r.email_sent    || 0);
      const opened  = Number(r.email_opened  || 0);
      const clicked = Number(r.email_clicked || 0);
      if (!sent) return <span className="text-muted text-12">—</span>;
      return (
        <div className="d-flex flex-column gap-1">
          <span className="badge badge-crm text-bg-secondary" style={{ fontSize: '10px' }}>
            <i className="bi bi-envelope me-1" />{sent} sent
          </span>
          {opened  > 0 && <span className="badge badge-crm text-bg-warning text-dark" style={{ fontSize: '10px' }}><i className="bi bi-eye me-1" />{opened} opened</span>}
          {clicked > 0 && <span className="badge badge-crm text-bg-success"           style={{ fontSize: '10px' }}><i className="bi bi-cursor me-1" />{clicked} clicked</span>}
        </div>
      );
    }},
    { label: 'WhatsApp', render: (r) => {
      const sent      = Number(r.wa_sent      || 0);
      const delivered = Number(r.wa_delivered || 0);
      if (!sent) return <span className="text-muted text-12">—</span>;
      return (
        <div className="d-flex flex-column gap-1">
          <span className="badge badge-crm" style={{ background: '#25D366', color: '#fff', fontSize: '10px' }}>
            <i className="bi bi-whatsapp me-1" />{sent} sent
          </span>
          {delivered > 0 && <span className="badge badge-crm text-bg-success" style={{ fontSize: '10px' }}>✓ {delivered} delivered</span>}
        </div>
      );
    }},
    { label: 'SMS', render: (r) => {
      const sent      = Number(r.sms_sent      || 0);
      const delivered = Number(r.sms_delivered || 0);
      if (!sent) return <span className="text-muted text-12">—</span>;
      return (
        <div className="d-flex flex-column gap-1">
          <span className="badge badge-crm text-bg-secondary" style={{ fontSize: '10px' }}>
            <i className="bi bi-chat-dots me-1" />{sent} sent
          </span>
          {delivered > 0 && <span className="badge badge-crm text-bg-primary" style={{ fontSize: '10px' }}>✓ {delivered} delivered</span>}
        </div>
      );
    }},
    { label: 'RCS', render: (r) => {
      const sent      = Number(r.rcs_sent      || 0);
      const delivered = Number(r.rcs_delivered || 0);
      if (!sent) return <span className="text-muted text-12">—</span>;
      return (
        <div className="d-flex flex-column gap-1">
          <span className="badge badge-crm text-bg-info" style={{ fontSize: '10px' }}>
            <i className="bi bi-chat-square-dots me-1" />{sent} sent
          </span>
          {delivered > 0 && <span className="badge badge-crm text-bg-success" style={{ fontSize: '10px' }}>✓ {delivered} delivered</span>}
        </div>
      );
    }},
  ];

  const pages = pageRange(filters.page, lastPage);
  const from  = total === 0 ? 0 : (filters.page - 1) * filters.limit + 1;
  const to    = Math.min(filters.page * filters.limit, total);

  return (
    <>
      {/* Header */}
      <div className="d-flex align-items-center mb-4 gap-2 flex-wrap">
        <h5 className="fw-bold mb-0 me-auto text-brand d-flex align-items-center gap-2">
          Leads <span className="badge badge-purple badge-crm">{total}</span>
          <span className="d-flex align-items-center gap-1 text-12 fw-normal text-success">
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
            Live
          </span>
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

        {/* Pagination footer */}
        {total > 0 && (
          <div className="d-flex align-items-center justify-content-between px-3 py-2 border-top flex-wrap gap-2">
            <span className="text-12 text-muted">
              Showing {from}–{to} of {total} leads
            </span>

            <nav>
              <ul className="pagination pagination-sm mb-0 gap-1">
                <li className={`page-item ${filters.page <= 1 ? 'disabled' : ''}`}>
                  <button className="page-link rounded" onClick={() => setPage(filters.page - 1)}>«</button>
                </li>
                {pages.map((p, i) =>
                  p === '…' ? (
                    <li key={`ellipsis-${i}`} className="page-item disabled">
                      <span className="page-link border-0 bg-transparent">…</span>
                    </li>
                  ) : (
                    <li key={p} className={`page-item ${p === filters.page ? 'active' : ''}`}>
                      <button className="page-link rounded" onClick={() => setPage(p)}>{p}</button>
                    </li>
                  )
                )}
                <li className={`page-item ${filters.page >= lastPage ? 'disabled' : ''}`}>
                  <button className="page-link rounded" onClick={() => setPage(filters.page + 1)}>»</button>
                </li>
              </ul>
            </nav>

            <select
              className="form-select form-select-sm w-auto"
              style={{ minWidth: 80 }}
              value={filters.limit}
              onChange={(e) => setFilters((p) => ({ ...p, limit: Number(e.target.value), page: 1 }))}
            >
              {LIMIT_OPTS.map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
          </div>
        )}
      </div>
    </>
  );
}
