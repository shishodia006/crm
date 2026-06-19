import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', company: '' });
  const [showPass, setShowPass] = useState(false);
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm((p) => ({ ...p, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Passwords do not match.'); return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.'); return;
    }
    setLoading(true);
    try {
      await register({ name: form.name, email: form.email, password: form.password, company: form.company });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
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
          <p className="text-muted-2 text-13 mb-0 mt-1">Create your account</p>
        </div>

        {error && (
          <div className="alert alert-danger py-2 mb-3 rounded-crm-xs text-13">
            <i className="bi bi-exclamation-circle me-2" />{error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Full Name */}
          <div className="mb-3">
            <label className="crm-label">Full Name</label>
            <div className="position-relative">
              <i className="bi bi-person crm-login-input-icon" />
              <input
                type="text" name="name" value={form.name}
                onChange={handleChange} required autoFocus
                placeholder="Your full name"
                className="crm-login-input"
              />
            </div>
          </div>

          {/* Company Name */}
          <div className="mb-3">
            <label className="crm-label">Company Name <span className="text-muted-2 fw-normal">(optional)</span></label>
            <div className="position-relative">
              <i className="bi bi-building crm-login-input-icon" />
              <input
                type="text" name="company" value={form.company}
                onChange={handleChange}
                placeholder="Your company name"
                className="crm-login-input"
              />
            </div>
          </div>

          {/* Email */}
          <div className="mb-3">
            <label className="crm-label">Email Address</label>
            <div className="position-relative">
              <i className="bi bi-envelope crm-login-input-icon" />
              <input
                type="email" name="email" value={form.email}
                onChange={handleChange} required
                placeholder="you@company.com"
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
                placeholder="Min. 6 characters"
                className="crm-login-input"
              />
              <button type="button" className="crm-login-eye" onClick={() => setShowPass((v) => !v)}>
                <i className={`bi bi-eye${showPass ? '-slash' : ''} text-15`} />
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="mb-4">
            <label className="crm-label">Confirm Password</label>
            <div className="position-relative">
              <i className="bi bi-shield-lock crm-login-input-icon" />
              <input
                type={showPass ? 'text' : 'password'}
                name="confirm" value={form.confirm}
                onChange={handleChange} required
                placeholder="Repeat password"
                className="crm-login-input"
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="crm-login-btn">
            {loading
              ? <><span className="spinner-border spinner-border-sm" />Creating account…</>
              : <><i className="bi bi-person-check" />Create Account</>
            }
          </button>
        </form>

        <p className="text-center text-13 text-muted-2 mt-4 mb-0">
          Already have an account?{' '}
          <Link to="/login" className="text-purple fw-500 text-decoration-none">Sign In</Link>
        </p>
      </div>
    </div>
  );
}
