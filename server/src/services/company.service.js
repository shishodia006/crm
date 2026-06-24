import { one, q, run } from '../db/pool.js';

export function slugifyCompanyName(name) {
  return String(name || '')
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 140);
}

export async function companiesForUser(user) {
  if (!user) return [];
  const isPlatformAdmin = ['admin', 'superadmin'].includes(user.role);
  return q(
    isPlatformAdmin
      ? 'SELECT c.*, cu.role AS company_role FROM companies c LEFT JOIN company_users cu ON cu.company_id=c.id AND cu.user_id=? WHERE c.is_active=1 ORDER BY c.name'
      : 'SELECT c.*, cu.role AS company_role FROM companies c JOIN company_users cu ON cu.company_id=c.id WHERE cu.user_id=? AND c.is_active=1 ORDER BY c.name',
    [user.id]
  );
}

export async function canAccessCompany(user, companyId) {
  if (!user || !companyId) return false;
  if (['admin', 'superadmin'].includes(user.role)) {
    return Boolean(await one('SELECT id FROM companies WHERE id=? AND is_active=1 LIMIT 1', [companyId]));
  }
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
