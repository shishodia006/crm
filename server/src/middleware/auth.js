import { one } from '../db/pool.js';
import { fail } from '../utils/response.js';
import { hasRole } from '../utils/helpers.js';

export async function currentUser(req, _res, next) {
  req.user = null;
  if (req.session?.userId) {
    req.user = await one(
      'SELECT id,name,email,role,avatar,phone,is_active,last_login_at,created_at FROM users WHERE id=? AND is_active=1 LIMIT 1',
      [req.session.userId]
    ) || null;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return fail(res, 'Unauthenticated', 401);
  next();
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return fail(res, 'Unauthenticated', 401);
    if (!hasRole(req.user, ...roles)) return fail(res, 'Insufficient permissions.', 403);
    next();
  };
}
