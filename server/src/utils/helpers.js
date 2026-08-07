import crypto from 'crypto';

export function isAdmin(user) {
  return ['admin', 'superadmin'].includes(user?.role || '');
}

// One key per company (workspace), not per user — every member of a company,
// invited or original, authenticates POST /ingest/:source with this same
// value. Plaintext (not encrypted at rest), same convention as
// integration_accounts.webhook_key — both are opaque bearer secrets looked
// up by direct `WHERE api_key=?` equality, which AES-GCM's random IV would
// make impossible without an expensive decrypt-every-row loop.
export function generateApiKey() {
  return `ddk_${crypto.randomBytes(24).toString('hex')}`;
}

export function hasRole(user, ...roles) {
  return roles.includes(user?.role);
}

export function normalizeHash(hash) {
  return String(hash || '').replace(/^\$2y\$/, '$2b$');
}

export function titleCase(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function cleanString(value, max = 255) {
  const text = String(value ?? '').trim();
  return text ? text.slice(0, max) : null;
}

export function boolInt(value) {
  return value === true || value === '1' || value === 'true' || value === 1 ? 1 : 0;
}

export function jsonOrNull(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function ipAddress(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(raw || req.socket.remoteAddress || '0.0.0.0').split(',')[0].trim();
}

export function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
