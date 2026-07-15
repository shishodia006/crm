import { useState } from 'react';
import { useResource } from '../../hooks/useResource.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import { useConfirm } from '../../hooks/useConfirm.js';

function InviteModal({ onClose, onInvited }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', role: 'agent' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await api.post('/api/settings/users/invite', form);
      toast(result.email_sent ? `Invite sent to ${form.email}.` : 'Team member added — configure SMTP under Channels to email invites.', 'success');
      onInvited();
    } catch (err) { toast(err.message, 'danger'); }
    finally { setSaving(false); }
  };

  return (
    <div className="crm-modal-backdrop" onClick={onClose}>
      <div className="crm-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="crm-modal-header">
          <div className="fw-bold text-15">Invite Team Member</div>
          <button className="crm-drawer-close" onClick={onClose}><i className="bi bi-x-lg text-13" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4">
          <div className="mb-3">
            <label className="crm-label">Full Name</label>
            <input className="crm-input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </div>
          <div className="mb-3">
            <label className="crm-label">Email</label>
            <input type="email" className="crm-input" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
          </div>
          <div className="mb-3">
            <label className="crm-label">Role</label>
            <select className="crm-select w-100" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
              <option value="agent">Sales Rep</option>
              <option value="manager">Account Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="d-flex gap-2 mt-4">
            <button className="btn-crm flex-grow-1" disabled={saving}>{saving ? 'Sending…' : 'Send Invite'}</button>
            <button type="button" className="btn btn-outline-secondary rounded-crm-btn" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TeamSettings() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, reload } = useResource('/api/companies/members');
  const members = data?.members ?? [];
  const [showInvite, setShowInvite] = useState(false);

  const active = members.filter((m) => m.status !== 'invited').length;
  const invited = members.filter((m) => m.status === 'invited').length;

  const removeMember = async (userId) => {
    if (!(await confirm('Remove this team member from the company?', { title: 'Remove member' }))) return;
    try { await api.delete(`/api/companies/members/${userId}`); toast('Removed.', 'success'); reload(); }
    catch (err) { toast(err.message, 'danger'); }
  };

  return (
    <div className="card crm-card">
      <div className="card-body p-4">
        <h6 className="fw-bold mb-1 text-brand">Team</h6>
        <p className="text-muted text-12 mb-3">{active} member{active === 1 ? '' : 's'}{invited > 0 ? ` · ${invited} pending invite${invited === 1 ? '' : 's'}` : ''}</p>
        <hr className="mb-3" />

        {loading ? <LoadingBox /> : (
          <div>
            {members.map((m) => (
              <div key={m.id} className="d-flex align-items-center justify-content-between py-3 border-bottom">
                <div>
                  <div className="fw-bold text-14">{m.name}</div>
                  <div className="text-12 text-muted-3">{m.email} &middot; {m.company_role || m.role}</div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span className={`badge badge-crm badge-${m.status === 'invited' ? 'waiting' : 'live'}`}>
                    {m.status === 'invited' ? 'Invited' : 'Active'}
                  </span>
                  <button className="btn btn-sm btn-outline-danger" onClick={() => removeMember(m.id)}><i className="bi bi-x-lg" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="btn-crm mt-4" onClick={() => setShowInvite(true)}><i className="bi bi-person-plus-fill" />Invite Team Member</button>
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onInvited={() => { setShowInvite(false); reload(); }} />}
    </div>
  );
}
