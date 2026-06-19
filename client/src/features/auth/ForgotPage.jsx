import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api.js';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.post('/api/auth/forgot', { email });
      setSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
      <div className="card shadow-sm crm-auth-card">
        <div className="card-body p-4">
          <h5 className="fw-bold mb-1">Forgot password</h5>
          <p className="text-muted small mb-4">Enter your email and we'll send a reset link.</p>
          {sent ? (
            <div className="alert alert-success">
              Check your inbox for the reset link.
            </div>
          ) : (
            <>
              {error && <div className="alert alert-danger py-2">{error}</div>}
              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="form-label">Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="form-control"
                    required
                    autoFocus
                  />
                </div>
                <button className="btn btn-primary w-100" disabled={loading}>
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
          <div className="text-center mt-3">
            <Link to="/login" className="text-muted small">Back to login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
