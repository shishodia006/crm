import { fail } from '../utils/response.js';
import { canAccessCompany, companiesForUser } from '../services/company.service.js';

export async function currentCompany(req, _res, next) {
  req.company = null;
  req.companyId = null;
  if (!req.user) return next();

  const companies = await companiesForUser(req.user);
  if (!companies.length) return next();
  let companyId = Number(req.session?.companyId || 0);
  if (!companyId || !companies.some((company) => Number(company.id) === companyId)) companyId = Number(companies[0].id);
  req.session.companyId = companyId;
  req.companyId = companyId;
  req.company = companies.find((company) => Number(company.id) === companyId) || null;
  req.companyRole = ['admin', 'superadmin'].includes(req.user.role) ? 'admin' : (req.company?.company_role || 'viewer');
  next();
}

export function requireCompany(req, res, next) {
  if (!req.companyId) return fail(res, 'No company is selected. Create a company first.', 422);
  next();
}

export async function selectCompany(req, res, next) {
  const companyId = Number(req.body.company_id);
  if (!companyId || !(await canAccessCompany(req.user, companyId))) return fail(res, 'Company not found or access denied.', 404);
  req.session.companyId = companyId;
  next();
}

const ROLE_LEVEL = { viewer: 1, agent: 2, manager: 3, admin: 4 };

export function requireCompanyRole(...roles) {
  const minimum = Math.min(...roles.map((role) => ROLE_LEVEL[role] || 99));
  return (req, res, next) => {
    if ((ROLE_LEVEL[req.companyRole] || 0) < minimum) return fail(res, 'Your company role does not allow this action.', 403);
    next();
  };
}
