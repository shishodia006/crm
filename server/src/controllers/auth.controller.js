import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { one, run } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { normalizeHash } from '../utils/helpers.js';
import { config } from '../config/index.js';

export async function me(req, res) {
  ok(res, { user: req.user, csrfToken: req.session.csrfToken, env: config.env }, 'Session loaded.');
}

export async function login(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return fail(res, 'Email and password required.', 422);
  const user = await one('SELECT * FROM users WHERE email=? AND is_active=1 LIMIT 1', [email]);
  if (!user || !(await bcrypt.compare(password, normalizeHash(user.password)))) {
    return fail(res, 'Invalid credentials.', 401);
  }
  req.session.regenerate(async (error) => {
    if (error) return fail(res, 'Could not start session.', 500);
    req.session.userId = user.id;
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    await run('UPDATE users SET last_login_at=NOW() WHERE id=?', [user.id]);
    delete user.password;
    ok(res, { user, csrfToken: req.session.csrfToken }, 'Logged in.');
  });
}

export async function register(req, res) {
  const name     = String(req.body.name     || '').trim();
  const email    = String(req.body.email    || '').trim().toLowerCase();
  const password = String(req.body.password || '').trim();
  const company  = String(req.body.company  || '').trim();

  if (!name)     return fail(res, 'Full name is required.', 422);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 'Valid email is required.', 422);
  if (password.length < 6) return fail(res, 'Password must be at least 6 characters.', 422);

  const existing = await one('SELECT id FROM users WHERE email=? LIMIT 1', [email]);
  if (existing) return fail(res, 'An account with this email already exists.', 409);

  // First user ever → superadmin, else → admin
  const userCount = await one('SELECT COUNT(*) AS c FROM users');
  const role = Number(userCount?.c || 0) === 0 ? 'superadmin' : 'admin';
  const hash = await bcrypt.hash(password, 10);

  const result = await run(
    'INSERT INTO users (name,email,password,role,is_active) VALUES (?,?,?,?,1)',
    [name, email, hash, role]
  );
  const userId = Number(result.insertId);

  // Save company name as app setting if provided and first user
  if (company && role === 'superadmin') {
    await run("INSERT INTO settings (`key`,`value`,`group`) VALUES ('app_name',?,'general') ON DUPLICATE KEY UPDATE `value`=?", [company, company]);
  }

  // Auto login after register
  req.session.regenerate(async (err) => {
    if (err) return fail(res, 'Registration succeeded but could not start session.', 500);
    req.session.userId = userId;
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    ok(res, { csrfToken: req.session.csrfToken }, 'Account created! Welcome to Dot Domino CRM.');
  });
}

export async function logout(req, res) {
  req.session.destroy(() => ok(res, null, 'Logged out.'));
}

export async function forgotPassword(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 'Invalid email.', 422);
  const user = await one('SELECT id FROM users WHERE email=? LIMIT 1', [email]);
  let resetUrl = null;
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    await run('INSERT INTO password_resets (email,token,expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 1 HOUR))', [email, token]);
    resetUrl = `${config.appUrl}/auth/reset/${token}`;
  }
  ok(res, config.env === 'development' ? { resetUrl } : null, 'If that email exists, a reset link has been sent.');
}

export async function validateResetToken(req, res) {
  const row = await one('SELECT * FROM password_resets WHERE token=? AND used=0 AND expires_at > NOW() LIMIT 1', [req.params.token]);
  ok(res, { valid: Boolean(row), email: row?.email || null }, row ? 'Reset token valid.' : 'Invalid or expired reset link.');
}

export async function resetPassword(req, res) {
  const row = await one('SELECT * FROM password_resets WHERE token=? AND used=0 AND expires_at > NOW() LIMIT 1', [req.params.token]);
  if (!row) return fail(res, 'Invalid or expired token.', 404);
  const password = String(req.body.password || '');
  const confirm = String(req.body.password_confirm || req.body.passwordConfirm || '');
  if (password.length < 8 || password !== confirm) return fail(res, 'Password must be 8+ chars and match.', 422);
  const hashed = await bcrypt.hash(password, 12);
  await run('UPDATE users SET password=? WHERE email=?', [hashed, row.email]);
  await run('UPDATE password_resets SET used=1 WHERE token=?', [req.params.token]);
  ok(res, null, 'Password reset. Please login.');
}
