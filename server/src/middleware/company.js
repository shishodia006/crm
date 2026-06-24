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
