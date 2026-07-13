import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { money, pageRange } from '../../utils/formatters.js';

export default function CompaniesTab({ onViewContacts }) {
  const [page, setPage] = useState(1);
  const { data, loading } = useResource(`/api/company-directory?page=${page}&limit=25`, [page]);
  const companies = data?.companies ?? [];
  const total = data?.total ?? 0;
  const lastPage = data?.lastPage ?? 1;
  const pages = pageRange(page, lastPage);

  return (
    <div className="card crm-card">
      {loading ? <LoadingBox /> : companies.length === 0 ? (
        <div className="crm-empty">
          <i className="bi bi-buildings crm-empty-icon" />
          <div className="crm-empty-title">No companies yet</div>
          <div className="crm-empty-sub">Companies are derived from your contacts' Company field.</div>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="table align-middle mb-0 crm-table">
            <thead><tr><th></th><th>Company</th><th>Industry</th><th>Contacts</th><th>Deals</th><th>Value</th></tr></thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.name} className="crm-clickable-row" onClick={() => onViewContacts(c.name)}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="form-check-input" /></td>
                  <td className="fw-semibold text-13 crm-link">{c.name}</td>
                  <td className="text-13">{c.industry || '—'}</td>
                  <td className="text-13">{c.contacts}</td>
                  <td className="text-13">{c.deals}</td>
                  <td className="text-13 text-revenue">{money(c.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 0 && (
        <div className="d-flex align-items-center justify-content-between px-3 py-2 border-top flex-wrap gap-2">
          <span className="text-12 text-muted">Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total}</span>
          <nav>
            <ul className="pagination pagination-sm mb-0 gap-1">
              <li className={`page-item ${page <= 1 ? 'disabled' : ''}`}><button className="page-link rounded" onClick={() => setPage(page - 1)}>«</button></li>
              {pages.map((p, i) => p === '…'
                ? <li key={`e${i}`} className="page-item disabled"><span className="page-link border-0 bg-transparent">…</span></li>
                : <li key={p} className={`page-item ${p === page ? 'active' : ''}`}><button className="page-link rounded" onClick={() => setPage(p)}>{p}</button></li>)}
              <li className={`page-item ${page >= lastPage ? 'disabled' : ''}`}><button className="page-link rounded" onClick={() => setPage(page + 1)}>»</button></li>
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}
