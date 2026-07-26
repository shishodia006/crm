import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import { initials, pageRange } from '../../utils/formatters.js';

function parseTags(csv) {
  if (!csv) return [];
  return csv.split('||').map((entry) => {
    const [name, color] = entry.split(':');
    return { name, color: color || '#6c757d' };
  });
}

function AddContactModal({ onClose, onCreated }) {
  const toast = useToast();
  const [sources, setSources] = useState([]);
  const [form, setForm] = useState({ name: '', company: '', email: '', mobile: '', source_id: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get('/api/meta').then((d) => setSources(d?.sources ?? [])).catch(() => {}); }, []);

  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.source_id) { toast('Name and source are required.', 'danger'); return; }
    setSaving(true);
    try {
      await api.post('/api/leads', form);
      toast('Contact created.', 'success');
      onCreated();
    } catch (err) { toast(err.message, 'danger'); }
    finally { setSaving(false); }
  };

  return (
    <div className="crm-modal-backdrop" onClick={onClose}>
      <div className="crm-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="crm-modal-header">
          <div className="fw-bold text-15">Add Contact</div>
          <button className="crm-modal-close" onClick={onClose}><i className="bi bi-x-lg text-13" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-3"><label className="crm-label">Name</label><input className="crm-input" value={form.name} onChange={set('name')} required /></div>
          <div className="mb-3"><label className="crm-label">Company</label><input className="crm-input" value={form.company} onChange={set('company')} /></div>
          <div className="row g-3 mb-3">
            <div className="col-6"><label className="crm-label">Email</label><input type="email" className="crm-input" value={form.email} onChange={set('email')} /></div>
            <div className="col-6"><label className="crm-label">Mobile</label><input className="crm-input" value={form.mobile} onChange={set('mobile')} /></div>
          </div>
          <div className="mb-3">
            <label className="crm-label">Source</label>
            <select className="crm-select w-100" value={form.source_id} onChange={set('source_id')} required>
              <option value="">— Select —</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="d-flex gap-2 mt-4">
            <button className="btn-crm flex-grow-1" disabled={saving}>{saving ? 'Saving…' : 'Create Contact'}</button>
            <button type="button" className="btn btn-outline-secondary rounded-crm-btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ContactsTab({ companyFilter, onClearCompanyFilter, showAddModal, onCloseAddModal }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams({ search: companyFilter || search, page, limit: 25 }).toString();
  const { data, loading, reload } = useResource(`/api/leads?${qs}`, [search, page, companyFilter]);
  const contacts = data?.leads ?? [];
  const total = data?.pagination?.total ?? 0;
  const lastPage = data?.pagination?.last_page ?? 1;
  const pages = pageRange(page, lastPage);

  const handleImport = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const fd = new FormData(); fd.append('csv', file);
    try { const r = await api.post('/api/leads/import', fd); toast(`Imported ${r.imported} contacts.`, 'success'); reload(); }
    catch (err) { toast(err.message, 'danger'); }
    e.target.value = '';
  };

  return (
    <div>
      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <div className="crm-filter-search flex-shrink-0">
          <i className="bi bi-search crm-filter-icon" />
          <input className="form-control form-control-sm crm-filter-input" placeholder="Search contacts…"
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} disabled={!!companyFilter} />
        </div>
        {companyFilter && (
          <span className="badge badge-crm badge-purple">
            Company: {companyFilter}
            <button className="btn btn-link btn-sm text-white p-0 ms-2" onClick={onClearCompanyFilter}><i className="bi bi-x-lg" /></button>
          </span>
        )}
        <label className="btn btn-sm btn-outline-secondary rounded-crm-xs text-13 mb-0 ms-auto" style={{ cursor: 'pointer' }}>
          <i className="bi bi-upload me-1" />Import CSV
          <input type="file" accept=".csv" className="d-none" onChange={handleImport} />
        </label>
      </div>

      <div className="card crm-card">
        {loading ? <LoadingBox /> : contacts.length === 0 ? (
          <div className="crm-empty">
            <i className="bi bi-people crm-empty-icon" />
            <div className="crm-empty-title">No contacts found</div>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table align-middle mb-0 crm-table">
              <thead><tr><th>Contact</th><th>Company</th><th>Email</th><th>Phone</th><th>Tags</th></tr></thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="crm-clickable-row" onClick={() => navigate(`/leads/${c.id}`)}>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <span className="crm-agent-avatar">{initials(c.name)}</span>
                        <span className="fw-semibold text-13">{c.name}</span>
                      </div>
                    </td>
                    <td className="text-13">{c.company || '—'}</td>
                    <td className="text-13">{c.email || '—'}</td>
                    <td className="text-13">{c.mobile || '—'}</td>
                    <td>
                      {parseTags(c.tags_csv).map((t) => (
                        <span key={t.name} className="badge badge-crm me-1" style={{ background: `${t.color}22`, color: t.color }}>{t.name}</span>
                      ))}
                      {!c.tags_csv && <span className="text-muted-3">—</span>}
                    </td>
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

      {showAddModal && <AddContactModal onClose={onCloseAddModal} onCreated={() => { onCloseAddModal(); reload(); }} />}
    </div>
  );
}
