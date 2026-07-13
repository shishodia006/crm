import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { one, run, updateById } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { normalizeHash } from '../utils/helpers.js';
import { config } from '../config/index.js';
import { companiesForUser, createCompany } from '../services/company.service.js';

export async function me(req, res) {
  ok(res, { user: req.user, company: req.company || null, companies: req.user ? await companiesForUser(req.user) : [], csrfToken: req.session.csrfToken, env: config.env }, 'Session loaded.');
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
    const companies = await companiesForUser(user);
    if (companies.length) req.session.companyId = companies[0].id;
    ok(res, { user, company: companies[0] || null, companies, csrfToken: req.session.csrfToken }, 'Logged in.');
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

  // Every new account owns an initial workspace. Existing installations use
  // database/migrations/001_multicompany.sql to create their Default Workspace.
  const workspace = await createCompany({ name: company || `${name}'s Company`, userId });

  // Auto login after register
  req.session.regenerate(async (err) => {
    if (err) return fail(res, 'Registration succeeded but could not start session.', 500);
    req.session.userId = userId;
    req.session.companyId = workspace.id;
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
    resetUrl = `${config.appUrl}/reset-password/${token}`;
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
  await run("UPDATE users SET password=?, status='active' WHERE email=?", [hashed, row.email]);
  await run('UPDATE password_resets SET used=1 WHERE token=?', [req.params.token]);
  ok(res, null, 'Password reset. Please login.');
}

export async function updateProfile(req, res) {
  const name = req.body.name !== undefined ? String(req.body.name).trim() : undefined;
  const email = req.body.email !== undefined ? String(req.body.email).trim().toLowerCase() : undefined;
  const phone = req.body.phone !== undefined ? String(req.body.phone).trim() : undefined;
  const timezone = req.body.timezone !== undefined ? String(req.body.timezone).trim() : undefined;

  if (name !== undefined && !name) return fail(res, 'Name cannot be empty.', 422);
  if (email !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 'Valid email is required.', 422);
    const existing = await one('SELECT id FROM users WHERE email=? AND id!=? LIMIT 1', [email, req.user.id]);
    if (existing) return fail(res, 'Another account already uses this email.', 409);
  }

  const data = {};
  if (name !== undefined) data.name = name;
  if (email !== undefined) data.email = email;
  if (phone !== undefined) data.phone = phone || null;
  if (timezone !== undefined) data.timezone = timezone || null;
  if (!Object.keys(data).length) return fail(res, 'Nothing to update.', 422);

  await updateById('users', req.user.id, data);
  const updated = await one('SELECT id,name,email,role,avatar,phone,timezone,is_active,last_login_at,created_at FROM users WHERE id=? LIMIT 1', [req.user.id]);
  ok(res, { user: updated }, 'Profile updated.');
}

export async function changePassword(req, res) {
  const current = String(req.body.current_password || '');
  const password = String(req.body.password || '');
  const confirm = String(req.body.password_confirm || req.body.passwordConfirm || '');
  if (password.length < 8 || password !== confirm) return fail(res, 'New password must be 8+ chars and match.', 422);
  const user = await one('SELECT password FROM users WHERE id=? LIMIT 1', [req.user.id]);
  if (!user || !(await bcrypt.compare(current, normalizeHash(user.password)))) {
    return fail(res, 'Current password is incorrect.', 401);
  }
  const hashed = await bcrypt.hash(password, 12);
  await run('UPDATE users SET password=? WHERE id=?', [hashed, req.user.id]);
  ok(res, null, 'Password changed.');
}
