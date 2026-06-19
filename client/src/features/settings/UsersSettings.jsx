import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { formatDate } from '../../utils/formatters.js';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';

const BLANK = { name: '', email: '', password: '', role: 'agent' };

export default function UsersSettings() {
  const toast = useToast();
  const { data, loading, reload } = useResource('/api/settings/users');
  const users = data?.users ?? [];
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState(null);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/settings/users', form);
      toast('User created.', 'success');
      setForm(BLANK);
      setShowForm(false);
      reload();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch(`/api/settings/users/${editUser.id}`, form);
      toast('User updated.', 'success');
      setEditUser(null);
      setForm(BLANK);
      reload();
    } catch (err) {
      toast(err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (user) => {
    try {
      await api.patch(`/api/settings/users/${user.id}`, { is_active: !user.is_active });
      reload();
    } catch (err) {
      toast(err.message, 'danger');
    }
  };

  const openEdit = (user) => {
    setEditUser(user);
    setForm({ name: user.name, email: user.email, password: '', role: user.role });
    setShowForm(false);
  };

  if (loading) return <LoadingBox />;

  return (
    <div>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <h5 className="fw-bold mb-0 text-brand">User Management</h5>
        <button
          className="btn btn-crm"
          onClick={() => { setShowForm((v) => !v); setEditUser(null); setForm(BLANK); }}
        >
          <i className="bi bi-person-plus-fill" />Add User
        </button>
      </div>

      {/* Add User form */}
      {showForm && (
        <div className="card crm-card mb-4">
          <div className="card-body p-4">
            <h6 className="fw-bold mb-3 text-brand">
              <i className="bi bi-person-plus me-2 text-purple" />New User
            </h6>
            <form onSubmit={handleCreate}>
              <div className="row g-3">
                <div className="col-md-3">
                  <label className="crm-label">Full Name <span className="req">*</span></label>
                  <input className="form-control crm-input" placeholder="John Doe"
                    value={form.name} onChange={(e) => set('name', e.target.value)} required />
                </div>
                <div className="col-md-3">
                  <label className="crm-label">Email <span className="req">*</span></label>
                  <input type="email" className="form-control crm-input" placeholder="john@company.com"
                    value={form.email} onChange={(e) => set('email', e.target.value)} required />
                </div>
                <div className="col-md-3">
                  <label className="crm-label">Password <span className="req">*</span></label>
                  <input type="password" className="form-control crm-input" placeholder="Min 8 characters"
                    value={form.password} onChange={(e) => set('password', e.target.value)} required minLength={8} />
                </div>
                <div className="col-md-2">
                  <label className="crm-label">Role</label>
                  <select className="form-select crm-select"
                    value={form.role} onChange={(e) => set('role', e.target.value)}>
                    {['agent', 'manager', 'admin'].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="col-md-1 d-flex align-items-end">
                  <button className="btn btn-crm w-100" disabled={saving}>
                    {saving ? <span className="spinner-border spinner-border-sm" /> : 'Add'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User form */}
      {editUser && (
        <div className="card crm-card crm-card-accent-left mb-4">
          <div className="card-body p-4">
            <h6 className="fw-bold mb-3 text-brand">
              <i className="bi bi-pencil-square me-2 text-purple" />Edit — {editUser.name}
            </h6>
            <form onSubmit={handleEdit}>
              <div className="row g-3">
                <div className="col-md-3">
                  <label className="crm-label">Full Name</label>
                  <input className="form-control crm-input"
                    value={form.name} onChange={(e) => set('name', e.target.value)} required />
                </div>
                <div className="col-md-3">
                  <label className="crm-label">Email</label>
                  <input type="email" className="form-control crm-input"
                    value={form.email} onChange={(e) => set('email', e.target.value)} required />
                </div>
                <div className="col-md-3">
                  <label className="crm-label">New Password</label>
                  <input type="password" className="form-control crm-input" placeholder="Leave blank to keep"
                    value={form.password} onChange={(e) => set('password', e.target.value)} minLength={8} />
                </div>
                <div className="col-md-2">
                  <label className="crm-label">Role</label>
                  <select className="form-select crm-select"
                    value={form.role} onChange={(e) => set('role', e.target.value)}>
                    {['agent', 'manager', 'admin', 'superadmin'].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className="col-md-1 d-flex align-items-end">
                  <button className="btn btn-crm" disabled={saving}>
                    {saving ? <span className="spinner-border spinner-border-sm" /> : 'Save'}
                  </button>
                </div>
              </div>
              <button type="button" className="btn btn-link text-muted mt-2 p-0 text-12"
                onClick={() => { setEditUser(null); setForm(BLANK); }}>
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card crm-card">
        <div className="table-responsive">
          <table className="table crm-table align-middle mb-0">
            <thead>
              <tr>
                {['Name', 'Email', 'Role', 'Status', 'Last Login', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={6} className="text-center text-muted py-5">No users found.</td></tr>
              ) : users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 fw-semibold text-dark">{u.name}</td>
                  <td className="px-4 py-3 text-muted-2">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`badge badge-crm badge-${u.role}`}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge badge-crm ${u.is_active ? 'badge-active' : 'badge-archived'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-2">
                    {u.last_login_at ? formatDate(u.last_login_at) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="d-flex gap-2">
                      <button className="crm-user-edit-btn" onClick={() => openEdit(u)}>Edit</button>
                      <button
                        className={u.is_active ? 'crm-user-deactivate-btn' : 'crm-user-activate-btn'}
                        onClick={() => toggleActive(u)}
                      >
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
