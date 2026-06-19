import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [form, setForm]       = useState({ email: '', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleChange  = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(form.email, form.password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid credentials. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <div className="crm-login-bg">
      <div className="crm-login-card">
        {/* Logo */}
        <div className="text-center mb-4">
          <div className="crm-login-logo">
            <i className="bi bi-grid-3x3-gap-fill text-white fs-5" />
          </div>
          <h4 className="fw-bold text-brand mb-1">
            Dot Domino <span className="text-purple">CRM</span>
          </h4>
          <small className="text-muted">CRM &amp; Drip Automation</small>
          <p className="text-muted-2 text-13 mb-0 mt-1">Sign in to your account</p>
        </div>

        {error && (
          <div className="alert alert-danger py-2 mb-3 rounded-crm-xs text-13">
            <i className="bi bi-exclamation-circle me-2" />{error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Email */}
          <div className="mb-3">
            <label className="crm-label">Email Address</label>
            <div className="position-relative">
              <i className="bi bi-envelope crm-login-input-icon" />
              <input
                type="email" name="email" value={form.email}
                onChange={handleChange} required autoFocus
                placeholder="admin@dotdomino.com"
                className="crm-login-input"
              />
            </div>
          </div>

          {/* Password */}
          <div className="mb-3">
            <label className="crm-label">Password</label>
            <div className="position-relative">
              <i className="bi bi-lock crm-login-input-icon" />
              <input
                type={showPass ? 'text' : 'password'}
                name="password" value={form.password}
                onChange={handleChange} required
                placeholder="••••••••"
                className="crm-login-input"
              />
              <button type="button" className="crm-login-eye" onClick={() => setShowPass((v) => !v)}>
                <i className={`bi bi-eye${showPass ? '-slash' : ''} text-15`} />
              </button>
            </div>
          </div>

          {/* Remember + Forgot */}
          <div className="d-flex align-items-center justify-content-between mb-4">
            <label className="d-flex align-items-center gap-2 text-13 text-muted-2 cursor-pointer mb-0">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                className="crm-checkbox" />
              Remember me
            </label>
            <Link to="/forgot-password" className="text-13 text-purple fw-500 text-decoration-none">
              Forgot password?
            </Link>
          </div>

          <button type="submit" disabled={loading} className="crm-login-btn">
            {loading
              ? <><span className="spinner-border spinner-border-sm" />Signing in…</>
              : <><i className="bi bi-box-arrow-in-right" />Sign In</>
            }
          </button>
        </form>

        <p className="text-center text-13 text-muted-2 mt-4 mb-0">
          New here?{' '}
          <Link to="/register" className="text-purple fw-500 text-decoration-none">Create Account</Link>
        </p>
      </div>
    </div>
  );
}
