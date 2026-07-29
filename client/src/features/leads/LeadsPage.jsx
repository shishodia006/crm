import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import Table from '../../components/common/Table.jsx';
import { formatDateTime, scoreClass } from '../../utils/formatters.js';
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
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [campaigns, setCampaigns] = useState([]);
  const [enrollCampaignId, setEnrollCampaignId] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    api.get('/api/campaigns').then((d) => setCampaigns(d?.campaigns ?? [])).catch(() => {});
  }, []);

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

  const toggleSelect = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allOnPageSelected = leads.length > 0 && leads.every((l) => selectedIds.has(l.id));
  const toggleSelectAll = () => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (allOnPageSelected) leads.forEach((l) => next.delete(l.id));
    else leads.forEach((l) => next.add(l.id));
    return next;
  });

  const updateLeadField = async (leadId, field, value) => {
    try {
      await api.patch(`/api/leads/${leadId}`, { [field]: value });
      toast(`${field === 'category' ? 'Category' : 'Status'} updated.`, 'success');
      reload();
    } catch (err) {
      toast(err.message || 'Update failed.', 'danger');
      reload();
    }
  };

  const handleBulkEnroll = async () => {
    if (!enrollCampaignId || selectedIds.size === 0) return;
    setEnrolling(true);
    try {
      const r = await api.post('/api/leads/bulk-enroll', { lead_ids: [...selectedIds], campaign_id: Number(enrollCampaignId) });
      toast(`Enrolled ${r.enrolled} of ${r.total} lead(s)${r.skipped ? ` — ${r.skipped} already enrolled or ineligible` : ''}.`, 'success');
      setSelectedIds(new Set());
      setEnrollCampaignId('');
    } catch (err) {
      toast(err.message || 'Bulk enroll failed.', 'danger');
    } finally {
      setEnrolling(false);
    }
  };

  const columns = [
    { label: (
        <input type="checkbox" className="form-check-input" checked={allOnPageSelected} onChange={toggleSelectAll} />
      ), key: '_select', render: (r) => (
        <input type="checkbox" className="form-check-input" checked={selectedIds.has(r.id)}
          onClick={(e) => e.stopPropagation()} onChange={() => toggleSelect(r.id)} />
      )
    },
    { label: 'Name', render: (r) => (
      <div>
        <div className="fw-semibold text-13 text-dark">{r.name}</div>
        {r.company && <div className="text-11 text-muted-2">{r.company}</div>}
      </div>
    )},
    { label: 'Email', render: (r) => (
      <span className="text-12 text-muted-2">{r.email || <span className="text-muted">—</span>}</span>
    )},
    { label: 'Mobile', render: (r) => (
      <span className="text-12 text-muted-2">{r.mobile || <span className="text-muted">—</span>}</span>
    )},
    { label: 'Source', render: (r) => r.source_name
        ? <span className="badge badge-source badge-crm">{r.source_name}</span>
        : <span className="text-muted">—</span>
    },
    { label: 'Type', render: (r) => r.lead_type
        ? <span className={`badge badge-${r.lead_type === 'direct_client' ? 'direct-client' : 'partner-client'} badge-crm`}>
            {r.lead_type === 'direct_client' ? 'Direct Client' : 'Partner Client'}
          </span>
        : <span className="text-muted">—</span>
    },
    { label: 'Category', render: (r) => {
      const cat = r.category?.toLowerCase().replace(' ', '_') || 'cold';
      return (
        <select
          className={`crm-inline-badge-select badge-${cat === 'sales_ready' ? 'sales-ready' : cat}`}
          value={cat}
          title="Click to change category"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => { e.stopPropagation(); updateLeadField(r.id, 'category', e.target.value); }}
        >
          {CATEGORY_OPTS.filter((o) => o.value).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }},
    { label: 'Status', render: (r) => (
      <select
        className={`crm-inline-badge-select badge-${r.status}`}
        value={r.status}
        title="Click to change status"
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => { e.stopPropagation(); updateLeadField(r.id, 'status', e.target.value); }}
      >
        {STATUS_OPTS.filter((o) => o.value).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )},
    { label: 'Score', render: (r) => (
      <span className={`badge text-bg-${scoreClass(r.score)} badge-crm`}>{r.score ?? 0}</span>
    )},
    { label: 'Added', render: (r) => <span className="text-12 text-muted-2 text-nowrap">{formatDateTime(r.created_at)}</span> },
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
        <label
          className={`btn btn-sm btn-outline-secondary rounded-crm-xs text-13 mb-0 ${importing ? '' : 'cursor-pointer'}`}
          style={importing ? { opacity: 0.65, pointerEvents: 'none' } : undefined}
        >
          {importing
            ? <><span className="spinner-border spinner-border-sm me-1" role="status" />Importing…</>
            : <><i className="bi bi-upload me-1" />Import CSV/Excel</>}
          <input type="file" accept=".csv,.xlsx,.xls" className="d-none" disabled={importing} onChange={async (e) => {
            const file = e.target.files[0]; if (!file) return;
            const fd = new FormData(); fd.append('csv', file);
            setImporting(true);
            try {
              const r = await api.post('/api/leads/import', fd);
              toast(`Imported ${r.imported} leads${r.duplicates ? `, ${r.duplicates} duplicate(s)` : ''}${r.failed ? `, ${r.failed} failed` : ''} (of ${r.total}).`, r.failed ? 'warning' : 'success');
              reload();
            } catch (err) {
              toast(err.message, 'danger');
            } finally {
              setImporting(false);
              e.target.value = '';
            }
          }} />
        </label>
        <button className="btn btn-sm btn-outline-secondary rounded-crm-xs text-13" onClick={() => { window.location = '/api/leads/import/sample'; }}>
          <i className="bi bi-file-earmark-arrow-down me-1" />Download Sample
        </button>
      </div>

      {/* Bulk enroll bar */}
      {selectedIds.size > 0 && (
        <div className="card crm-card-sm mb-3 border-primary">
          <div className="card-body py-2 d-flex gap-2 align-items-center flex-wrap">
            <span className="text-13 fw-semibold">{selectedIds.size} lead{selectedIds.size === 1 ? '' : 's'} selected</span>
            <select className="form-select form-select-sm w-auto" value={enrollCampaignId} onChange={(e) => setEnrollCampaignId(e.target.value)}>
              <option value="">— Select Campaign —</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn-crm btn-crm-sm" disabled={!enrollCampaignId || enrolling} onClick={handleBulkEnroll}>
              {enrolling ? 'Enrolling…' : 'Enroll Selected in Campaign'}
            </button>
            <button className="btn btn-sm btn-outline-secondary ms-auto" onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </button>
          </div>
        </div>
      )}

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
