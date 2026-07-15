import { useState, useEffect, useCallback, useRef } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../../hooks/useToast.js';
import { initials, timeAgo } from '../../utils/formatters.js';
import { api } from '../../services/api.js';
import { LogoMark } from '../common/Logo.jsx';
import { PageHeaderContext } from '../../context/PageHeaderContext.jsx';

/* ── Page title map ─────────────────────────────────────── */
const PAGE_TITLES = {
  '/dashboard':      { label: 'Dashboard',      icon: 'speedometer2' },
  '/conversations':  { label: 'Conversations',  icon: 'chat-dots-fill' },
  '/leads':        { label: 'Leads',           icon: 'people-fill' },
  '/pipeline':     { label: 'Pipeline',        icon: 'kanban-fill' },
  '/database':     { label: 'Database',        icon: 'server' },
  '/channels':     { label: 'Channels',         icon: 'broadcast' },
  '/sources':      { label: 'Sources',          icon: 'signpost-split-fill' },
  '/campaigns':    { label: 'Campaigns',       icon: 'megaphone-fill' },
  '/templates':    { label: 'Templates',       icon: 'file-earmark-text-fill' },
  '/tasks':        { label: 'Tasks',           icon: 'check2-square' },
  '/reports':      { label: 'Reports',         icon: 'bar-chart-line-fill' },
  '/analyst':      { label: 'My Analyst',       icon: 'stars' },
  '/revenue':      { label: 'Revenue',         icon: 'currency-rupee' },
  '/integrations': { label: 'Integrations',    icon: 'plug-fill' },
  '/settings':     { label: 'Settings',        icon: 'gear-fill' },
  '/users':        { label: 'User Management', icon: 'person-badge-fill' },
};
function usePageTitle() {
  const { pathname } = useLocation();
  const exact = PAGE_TITLES[pathname];
  if (exact) return exact;
  const prefix = Object.keys(PAGE_TITLES).find((k) => k !== '/' && pathname.startsWith(k));
  return prefix ? PAGE_TITLES[prefix] : { label: 'Dot Domino CRM', icon: 'grid-3x3-gap-fill' };
}

/* ── Sidebar nav sections ───────────────────────────────── */
const TOP_NAV_ITEMS = [
  { to: '/dashboard', icon: 'speedometer2',                  label: 'Dashboard' },
  { to: '/reports',   icon: 'file-earmark-bar-graph-fill', label: 'Custom Reports' },
  { to: '/analyst',   icon: 'stars',                        label: 'My Analyst' },
];

const NAV_SECTIONS = [
  { label: 'Workspace', items: [
    { to: '/conversations', icon: 'chat-dots-fill',   label: 'Conversations' },
    { to: '/tasks',     icon: 'check2-square',    label: 'Tasks & To-do' },
    { to: '/campaigns', icon: 'megaphone-fill',   label: 'Campaigns & Drip' },
    { to: '/ai-agents', icon: 'robot',            label: 'AI Agents', adminOnly: true },
  ]},
  { label: 'Business', items: [
    { to: '/pipeline', icon: 'briefcase-fill', label: 'Deals' },
    { to: '/leads',    icon: 'people-fill',    label: 'Leads' },
    { to: '/database', icon: 'server', label: 'Database' },
  ]},
  { label: 'Ecosystem', items: [
    { to: '/sources',      icon: 'signpost-split-fill', label: 'Sources' },
    { to: '/channels',     icon: 'broadcast',            label: 'Channels' },
    { to: '/integrations', icon: 'plug-fill',            label: 'Third Party Apps' },
  ]},
];
const ADMIN_ITEMS = [
  { to: '/settings', icon: 'gear-fill', label: 'Settings' },
];

/* ── Lead Search ────────────────────────────────────────── */
function LeadSearch() {
  const navigate = useNavigate();
  const wrapRef  = useRef(null);
  const timerRef = useRef(null);
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [busy,    setBusy]    = useState(false);
  const [open,    setOpen]    = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setOpen(false); return; }
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const d = await api.get(`/api/leads?search=${encodeURIComponent(q)}&page=1`);
        setResults((d?.leads ?? []).slice(0, 8));
        setOpen(true);
      } catch { setResults([]); setOpen(true); }
      finally { setBusy(false); }
    }, 320);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const go = (id) => { setQuery(''); setOpen(false); navigate(`/leads/${id}`); };

  return (
    <div className="crm-search-wrap" ref={wrapRef}>
      <i className="bi bi-search crm-search-icon" />
      {busy && <span className="spinner-border crm-search-spinner" />}
      <input
        className="crm-search-input"
        placeholder="Search leads…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => query.trim() && setOpen(true)}
      />
      {open && (
        <div className="crm-search-dropdown">
          {results.length === 0 ? (
            <div className="crm-search-empty">
              <i className="bi bi-person-slash fs-3 mb-2" />
              <span className="fw-semibold text-13">No lead found</span>
              <span className="text-11 mt-1">Try a different name, email or mobile</span>
            </div>
          ) : (
            <>
              <div className="crm-search-hint">{results.length} result{results.length !== 1 ? 's' : ''}</div>
              {results.map((l) => (
                <button key={l.id} className="crm-search-item" onClick={() => go(l.id)}>
                  <span className="crm-search-item-avatar">{initials(l.name)}</span>
                  <div className="overflow-hidden">
                    <div className="crm-search-item-name text-truncate">{l.name}</div>
                    <div className="crm-search-item-sub text-truncate">
                      {l.email || l.mobile || '—'}
                      {l.source_name && <span className="badge badge-purple badge-crm ms-2">{l.source_name}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Notification bell ─────────────────────────────────── */
function NotificationBell() {
  const navigate = useNavigate();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ unread: 0, items: [] });

  const load = useCallback(() => {
    api.get('/api/notifications').then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const openNotification = async (n) => {
    setOpen(false);
    if (!n.is_read) {
      try { await api.post(`/api/notifications/${n.id}/read`, {}); load(); } catch { /* non-critical */ }
    }
    if (n.link) navigate(n.link);
  };

  return (
    <div className="position-relative" ref={wrapRef}>
      <button className="crm-bell-btn" onClick={() => setOpen((v) => !v)}>
        <i className="bi bi-bell" />
        {data.unread > 0 && <span className="crm-bell-badge">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>
      {open && (
        <div className="crm-bell-dropdown shadow-sm">
          <div className="crm-bell-dropdown-title">Notifications</div>
          {data.items.length === 0 ? (
            <div className="text-muted text-12 text-center py-4">No notifications yet.</div>
          ) : (
            data.items.map((n) => (
              <button key={n.id} className={`crm-bell-item ${n.is_read ? '' : 'unread'}`} onClick={() => openNotification(n)}>
                <div className="fw-semibold text-13">{n.title}</div>
                {n.body && <div className="text-11 text-muted-3 text-truncate">{n.body}</div>}
                <div className="text-10 text-muted-3 mt-1">{timeAgo(n.created_at)} ago</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CompanySwitcher() {
  const { company, companies, switchCompany } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  if (!company || companies.length < 2) {
    return company ? <span className="text-muted text-12 text-truncate" title={company.name}>{company.name}</span> : null;
  }

  const selectCompany = async (companyId) => {
    if (Number(companyId) === Number(company.id)) return;
    try {
      await switchCompany(companyId);
      navigate('/dashboard');
      window.location.reload();
    } catch (error) {
      toast(error.message || 'Could not switch company.', 'danger');
    }
  };

  return (
    <div className="dropdown">
      <button className="btn btn-sm btn-outline-secondary dropdown-toggle text-truncate" style={{ maxWidth: 190 }} data-bs-toggle="dropdown">
        <i className="bi bi-buildings me-1" />{company.name}
      </button>
      <ul className="dropdown-menu shadow-sm" style={{ minWidth: 220 }}>
        {companies.map((item) => (
          <li key={item.id}>
            <button className={`dropdown-item d-flex align-items-center justify-content-between gap-2 ${Number(item.id) === Number(company.id) ? 'active' : ''}`} onClick={() => selectCompany(item.id)}>
              <span className="text-truncate">{item.name}</span>
              {Number(item.id) === Number(company.id) && <i className="bi bi-check-lg" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── New Lead Drawer ────────────────────────────────────── */
const BLANK = { name:'',company:'',email:'',mobile:'',designation:'',industry:'',city:'',state:'',country:'India',source_id:'',product_interest:'',notes:'' };

function NewLeadDrawer({ open, onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm]       = useState(BLANK);
  const [sources, setSources] = useState([]);
  const [saving, setSaving]   = useState(false);

  useEffect(() => { api.get('/api/meta').then((d) => setSources(d?.sources ?? [])).catch(() => {}); }, []);
  useEffect(() => { if (open) setForm(BLANK); }, [open]);

  const set = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const r = await api.post('/api/leads', form);
      toast('Lead created successfully.', 'success');
      onCreated?.(r?.id); onClose();
    } catch (err) { toast(err.message || 'Failed to create lead.', 'danger'); }
    finally { setSaving(false); }
  };

  return (
    <>
      {open && <div className="crm-drawer-backdrop" onClick={onClose} />}
      <div className={`crm-drawer ${open ? 'open' : ''}`}>
        <div className="crm-drawer-header">
          <div className="crm-drawer-title"><i className="bi bi-person-plus-fill" />New Lead</div>
          <button className="crm-drawer-close" onClick={onClose}><i className="bi bi-x-lg text-13" /></button>
        </div>

        <form onSubmit={handleSubmit} className="crm-drawer-body">
          <div className="mb-3">
            <label className="crm-label">Full Name <span className="req">*</span></label>
            <input name="name" value={form.name} onChange={set} required placeholder="Enter full name" className="crm-input" />
          </div>
          <div className="mb-3">
            <label className="crm-label">Company</label>
            <input name="company" value={form.company} onChange={set} placeholder="Company name" className="crm-input" />
          </div>
          <div className="row g-3 mb-3">
            <div className="col-6">
              <label className="crm-label">Email</label>
              <input type="email" name="email" value={form.email} onChange={set} placeholder="email@example.com" className="crm-input" />
            </div>
            <div className="col-6">
              <label className="crm-label">Mobile</label>
              <div className="position-relative">
                <span className="crm-mobile-prefix">+91</span>
                <input name="mobile" value={form.mobile} onChange={set} placeholder="XXXXXXXXXX"
                  className="crm-input crm-mobile-input" />
              </div>
            </div>
          </div>
          <div className="row g-3 mb-3">
            <div className="col-6">
              <label className="crm-label">Designation</label>
              <input name="designation" value={form.designation} onChange={set} placeholder="e.g. CEO" className="crm-input" />
            </div>
            <div className="col-6">
              <label className="crm-label">Industry</label>
              <input name="industry" value={form.industry} onChange={set} placeholder="e.g. Real Estate" className="crm-input" />
            </div>
          </div>
          <div className="row g-3 mb-3">
            <div className="col-6">
              <label className="crm-label">City</label>
              <input name="city" value={form.city} onChange={set} placeholder="City" className="crm-input" />
            </div>
            <div className="col-6">
              <label className="crm-label">State</label>
              <input name="state" value={form.state} onChange={set} placeholder="State" className="crm-input" />
            </div>
          </div>
          <div className="mb-3">
            <label className="crm-label">Country</label>
            <input name="country" value={form.country} onChange={set} placeholder="Country" className="crm-input" />
          </div>
          <div className="mb-3">
            <label className="crm-label">Source <span className="req">*</span></label>
            <select name="source_id" value={form.source_id} onChange={set} required className="crm-select w-100">
              <option value="">— Select Source —</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="mb-3">
            <label className="crm-label">Product Interest</label>
            <textarea name="product_interest" value={form.product_interest} onChange={set} rows={2}
              placeholder="What product/service are they interested in?" className="crm-input no-resize" />
          </div>
          <div className="mb-3">
            <label className="crm-label">Notes</label>
            <textarea name="notes" value={form.notes} onChange={set} rows={2}
              placeholder="Additional notes…" className="crm-input no-resize" />
          </div>
        </form>

        <div className="crm-drawer-footer">
          <button className="btn-crm btn-crm-lg flex-grow-1" disabled={saving} onClick={handleSubmit}>
            {saving ? <><span className="spinner-border spinner-border-sm me-2" />Saving…</> : <><i className="bi bi-check2-circle" />Create Lead</>}
          </button>
          <button className="btn btn-outline-secondary rounded-crm-btn fw-semibold text-13 min-w-90" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </>
  );
}

/* ── Main Layout ────────────────────────────────────────── */
export default function Layout() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen]             = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pageTabs, setPageTabs] = useState(null);
  const pageTitle = usePageTitle();
  const monthYear = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const handleLogout = async () => {
    try { await logout(); navigate('/login'); }
    catch { toast('Logout failed', 'danger'); }
  };

  const handleLeadCreated = useCallback((id) => {
    navigate(id ? `/leads/${id}` : '/leads');
  }, [navigate]);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  return (
    <PageHeaderContext.Provider value={setPageTabs}>
    <div className="d-flex crm-full-vh">

      {/* ── Sidebar ── */}
      <nav className={`crm-sidebar ${open ? '' : 'collapsed'}`}>
        {/* Brand */}
        <div className="crm-sidebar-brand">
          <div className="crm-sidebar-brand-icon">
            <LogoMark size={20} />
          </div>
          {open && (
            <div className="overflow-hidden">
              <div className="crm-sidebar-brand-name">
                <span style={{ color: '#5b9bf5' }}>DOT</span>{' '}
                <span style={{ color: '#4ade80' }}>DOMINO</span>
              </div>
              <div className="crm-sidebar-brand-sub">CRM PLATFORM</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <div className="crm-sidebar-nav">
          {TOP_NAV_ITEMS.map(({ to, icon, label }) => (
            <NavLink key={label} to={to} end={to === '/dashboard'} title={!open ? label : undefined}
              className={({ isActive }) => `crm-nav-link ${isActive ? 'active' : ''}`}>
              <i className={`bi bi-${icon} flex-shrink-0 crm-nav-icon`} />
              {open && <span className="text-truncate">{label}</span>}
            </NavLink>
          ))}
          <div className="crm-nav-divider" />

          {NAV_SECTIONS.map((section) => (
            <div key={section.label} className="mb-2">
              {open && <span className="crm-nav-section-label">{section.label}</span>}
              {section.items.filter((item) => !item.adminOnly || isAdmin).map((item) => {
                const { to, icon, label } = item;
                return (
                  <NavLink key={to} to={to} title={!open ? label : undefined}
                    className={({ isActive }) => `crm-nav-link ${isActive ? 'active' : ''}`}>
                    <i className={`bi bi-${icon} flex-shrink-0 crm-nav-icon`} />
                    {open && <span className="text-truncate">{label}</span>}
                  </NavLink>
                );
              })}
              {open && <div className="crm-nav-divider" />}
            </div>
          ))}

          {isAdmin && (
            <div>
              {ADMIN_ITEMS.map(({ to, icon, label }) => (
                <NavLink key={to} to={to} title={!open ? label : undefined}
                  className={({ isActive }) => `crm-nav-link ${isActive ? 'active' : ''}`}>
                  <i className={`bi bi-${icon} flex-shrink-0 crm-nav-icon`} />
                  {open && <span className="text-truncate">{label}</span>}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        {/* Bottom */}
        <div className="crm-sidebar-bottom">
          <button className="crm-sidebar-collapse" onClick={() => setOpen((v) => !v)}>
            <i className={`bi bi-chevron-${open ? 'left' : 'right'} flex-shrink-0 crm-collapse-icon`} />
            {open && <span>Collapse</span>}
          </button>
        </div>
      </nav>

      {/* ── Main area ── */}
      <div className="d-flex flex-column flex-grow-1 min-w-0 crm-full-vh">

        {/* Topbar */}
        <header className="crm-topbar">
          <div className="d-flex flex-column me-auto flex-shrink-0">
            <div className="d-flex align-items-center gap-2">
              <i className={`bi bi-${pageTitle.icon} crm-page-title-icon`} />
              <span className="crm-page-title-text">{pageTitle.label}</span>
            </div>
            <div className="crm-page-subtitle">
              {monthYear} &middot; <span className="crm-live-dot" />Live
            </div>
          </div>

          {pageTabs && (
            <div className="crm-tabs crm-topbar-tabs">
              {pageTabs.tabs.map((t) => (
                <button key={t.key} onClick={() => pageTabs.onChange(t.key)} className={`crm-tab${pageTabs.active === t.key ? ' active' : ''}`}>
                  {t.icon && <i className={`bi bi-${t.icon}`} />}
                  {t.label}
                  {t.badge != null && <span className="badge badge-crm badge-purple ms-1">{t.badge}</span>}
                </button>
              ))}
            </div>
          )}

          {!pageTabs && <CompanySwitcher />}

          <LeadSearch />

          {!pageTabs && (
            <button className="btn-crm" onClick={() => setDrawerOpen(true)}>
              <i className="bi bi-plus-lg" />New Lead
            </button>
          )}

          <NotificationBell />

          <div className="dropdown">
            <button className="btn btn-link text-dark text-decoration-none d-flex align-items-center gap-2 p-0" data-bs-toggle="dropdown">
              <span className="crm-topbar-avatar">{initials(user?.name)}</span>
              <i className="bi bi-chevron-down text-10 text-silver" />
            </button>
            <ul className="dropdown-menu dropdown-menu-end shadow-sm min-w-200">
              <li>
                <div className="px-3 py-2">
                  <div className="fw-semibold text-13">{user?.name}</div>
                  <div className="text-muted text-11">{user?.email}</div>
                </div>
              </li>
              <li><hr className="dropdown-divider" /></li>
              <li><NavLink to="/settings" className="dropdown-item"><i className="bi bi-gear me-2" />Settings</NavLink></li>
              <li>
                <button className="dropdown-item text-danger" onClick={handleLogout}>
                  <i className="bi bi-box-arrow-right me-2" />Sign out
                </button>
              </li>
            </ul>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-grow-1 bg-light p-4 crm-main-scroll">
          <Outlet />
        </main>
      </div>

      <NewLeadDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onCreated={handleLeadCreated} />
    </div>
    </PageHeaderContext.Provider>
  );
}
