import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../../services/api.js';

export default function ResetPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [valid, setValid] = useState(null);
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get(`/api/auth/reset/${token}`)
      .then(() => setValid(true))
      .catch(() => setValid(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    setLoading(true);
    setError('');
    try {
      await api.post(`/api/auth/reset/${token}`, { password: form.password });
      navigate('/login');
    } catch (err) {
      setError(err.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  if (valid === null) return null;
  if (!valid) return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center">
      <div className="text-center">
        <p className="text-danger">This reset link is invalid or has expired.</p>
        <Link to="/forgot-password" className="btn btn-outline-primary btn-sm">Request a new one</Link>
      </div>
    </div>
  );

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
      <div className="card shadow-sm crm-auth-card">
        <div className="card-body p-4">
          <h5 className="fw-bold mb-4">Set new password</h5>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">New password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                className="form-control"
                required minLength={8}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Confirm password</label>
              <input
                type="password"
                value={form.confirm}
                onChange={(e) => setForm((p) => ({ ...p, confirm: e.target.value }))}
                className="form-control"
                required
              />
            </div>
            <button className="btn btn-primary w-100" disabled={loading}>
              {loading ? 'Saving…' : 'Reset password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
