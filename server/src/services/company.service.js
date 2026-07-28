import { one, q, run } from '../db/pool.js';

export function slugifyCompanyName(name) {
  return String(name || '')
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

// A user's global `role` ('admin'/'superadmin' vs 'agent'/'manager') is about what
// they're allowed to DO within a company they belong to — it is not a platform-wide
// "see every tenant" grant. Membership (company_users) is what scopes which
// companies show up here, for every role, so one account never sees another
// account's workspace just because both happen to hold the 'admin' role.
export async function companiesForUser(user) {
  if (!user) return [];
  return q(
    'SELECT c.*, cu.role AS company_role FROM companies c JOIN company_users cu ON cu.company_id=c.id WHERE cu.user_id=? AND c.is_active=1 ORDER BY c.name',
    [user.id]
  );
}

// Master Dashboard is a deliberate cross-tenant reporting tool (route already
// gated to global admin/superadmin in app.routes.js) — unlike companiesForUser
// above, this one intentionally ignores company_users membership.
export async function allActiveCompanies() {
  return q('SELECT * FROM companies WHERE is_active=1 ORDER BY name');
}

export async function canAccessCompany(user, companyId) {
  if (!user || !companyId) return false;
  return Boolean(await one(
    'SELECT c.id FROM companies c JOIN company_users cu ON cu.company_id=c.id WHERE c.id=? AND c.is_active=1 AND cu.user_id=? LIMIT 1',
    [companyId, user.id]
  ));
}

export async function createCompany({ name, timezone, currency, userId }) {
  const baseSlug = slugifyCompanyName(name) || 'company';
  let slug = baseSlug;
  let suffix = 2;
  while (await one('SELECT id FROM companies WHERE slug=? LIMIT 1', [slug])) slug = `${baseSlug}-${suffix++}`;
  const result = await run(
    'INSERT INTO companies (name,slug,timezone,currency,created_by) VALUES (?,?,?,?,?)',
    [name, slug, timezone || null, currency || null, userId]
  );
  await run('INSERT INTO company_users (company_id,user_id,role) VALUES (?,?,?)', [result.insertId, userId, 'admin']);
  return one('SELECT * FROM companies WHERE id=? LIMIT 1', [result.insertId]);
}
