import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../../hooks/useToast.js';
import { api } from '../../services/api.js';

const TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin',
  'America/New_York', 'America/Los_Angeles', 'America/Chicago', 'Australia/Sydney', 'UTC',
];

export default function ProfileSettings() {
  const { user, reload } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', phone: '', timezone: '' });
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ current_password: '', password: '', password_confirm: '' });
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    if (user) setForm({ name: user.name || '', email: user.email || '', phone: user.phone || '', timezone: user.timezone || 'Asia/Kolkata' });
  }, [user]);

  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch('/api/auth/profile', form);
      toast('Profile updated.', 'success');
      reload();
    } catch (err) { toast(err.message, 'danger'); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setChangingPw(true);
    try {
      await api.post('/api/auth/change-password', pw);
      toast('Password changed.', 'success');
      setPw({ current_password: '', password: '', password_confirm: '' });
    } catch (err) { toast(err.message, 'danger'); }
    finally { setChangingPw(false); }
  };

  return (
    <div>
      <div className="card crm-card mb-3">
        <div className="card-body p-4">
          <h6 className="fw-bold mb-1 text-brand">Profile</h6>
          <p className="text-muted text-12 mb-3">Your personal account details.</p>
          <hr className="mb-4" />
          <form onSubmit={handleSave}>
            <div className="mb-3">
              <label className="crm-label">Full Name</label>
              <input className="crm-input" value={form.name} onChange={set('name')} required />
            </div>
            <div className="mb-3">
              <label className="crm-label">Email</label>
              <input type="email" className="crm-input" value={form.email} onChange={set('email')} required />
            </div>
            <div className="mb-3">
              <label className="crm-label">Phone</label>
              <input className="crm-input" value={form.phone} onChange={set('phone')} placeholder="+91 98xxxxxxxx" />
            </div>
            <div className="mb-3">
              <label className="crm-label">Time Zone</label>
              <select className="crm-select w-100" value={form.timezone} onChange={set('timezone')}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
            <button className="btn-crm" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
          </form>
        </div>
      </div>

      <div className="card crm-card">
        <div className="card-body p-4">
          <h6 className="fw-bold mb-1 text-brand">Change Password</h6>
          <p className="text-muted text-12 mb-3">Update the password you use to sign in.</p>
          <hr className="mb-4" />
          <form onSubmit={handleChangePassword}>
            <div className="row g-3 mb-3">
              <div className="col-md-4">
                <label className="crm-label">Current Password</label>
                <input type="password" className="crm-input" value={pw.current_password} onChange={(e) => setPw((p) => ({ ...p, current_password: e.target.value }))} required />
              </div>
              <div className="col-md-4">
                <label className="crm-label">New Password</label>
                <input type="password" className="crm-input" value={pw.password} onChange={(e) => setPw((p) => ({ ...p, password: e.target.value }))} minLength={8} required />
              </div>
              <div className="col-md-4">
                <label className="crm-label">Confirm New Password</label>
                <input type="password" className="crm-input" value={pw.password_confirm} onChange={(e) => setPw((p) => ({ ...p, password_confirm: e.target.value }))} minLength={8} required />
              </div>
            </div>
            <button className="btn btn-outline-secondary rounded-crm-btn" disabled={changingPw}>{changingPw ? 'Updating…' : 'Change Password'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
