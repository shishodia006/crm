import { one, q, run } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { companiesForUser, createCompany } from '../services/company.service.js';

export async function index(req, res) {
  ok(res, { companies: await companiesForUser(req.user), selectedCompanyId: req.companyId || null });
}

export async function store(req, res) {
  const name = String(req.body.name || '').trim();
  if (!name) return fail(res, 'Company name is required.', 422);
  const company = await createCompany({ name, timezone: req.body.timezone, currency: req.body.currency, userId: req.user.id });
  req.session.companyId = company.id;
  ok(res, { company }, 'Company created.');
}

export async function select(req, res) {
  const company = await one('SELECT * FROM companies WHERE id=? LIMIT 1', [Number(req.body.company_id)]);
  ok(res, { company }, 'Company switched.');
}

export async function members(req, res) {
  const members = await q(
    `SELECT u.id,u.name,u.email,u.role,u.is_active,cu.role AS company_role
     FROM company_users cu JOIN users u ON u.id=cu.user_id WHERE cu.company_id=? ORDER BY u.name`,
    [req.companyId]
  );
  ok(res, { members });
}

export async function saveMember(req, res) {
  const userId = Number(req.body.user_id);
  if (!userId) return fail(res, 'user_id is required.', 422);
  const user = await one('SELECT id FROM users WHERE id=? AND is_active=1 LIMIT 1', [userId]);
  if (!user) return fail(res, 'User not found.', 404);
  await run('INSERT INTO company_users (company_id,user_id,role) VALUES (?,?,?) ON DUPLICATE KEY UPDATE role=VALUES(role)', [req.companyId, userId, req.body.role || 'agent']);
  ok(res, null, 'Company member saved.');
}

export async function removeMember(req, res) {
  const userId = Number(req.params.userId);
  if (!userId) return fail(res, 'User id is required.', 422);
  const member = await one('SELECT role FROM company_users WHERE company_id=? AND user_id=? LIMIT 1', [req.companyId, userId]);
  if (!member) return fail(res, 'Company member not found.', 404);
  if (member.role === 'admin') {
    const admins = await one("SELECT COUNT(*) AS count FROM company_users WHERE company_id=? AND role='admin'", [req.companyId]);
    if (Number(admins?.count || 0) <= 1) return fail(res, 'A company must keep at least one admin.', 422);
  }
  await run('DELETE FROM company_users WHERE company_id=? AND user_id=?', [req.companyId, userId]);
  ok(res, null, 'Company member removed.');
}
