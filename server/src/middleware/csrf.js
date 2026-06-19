import { fail } from '../utils/response.js';

export function validateCsrf(req, res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const exempt =
    req.path.startsWith('/api/ingest/') ||
    req.path.startsWith('/api/webhook/') ||
    req.path.startsWith('/api/track/') ||
    req.path.startsWith('/oauth/');
  if (safe || exempt) return next();

  const provided =
    req.headers['x-csrf-token'] ||
    req.body?.csrf_token ||
    req.body?._token ||
    req.query?._token;
  if (!req.session?.csrfToken || provided !== req.session.csrfToken) {
    return fail(res, 'CSRF token mismatch.', 419);
  }
  next();
}
