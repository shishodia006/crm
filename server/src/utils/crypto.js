import crypto from 'crypto';
import { config } from '../config/index.js';

export function hmac(value) {
  return crypto.createHmac('sha256', config.appKey).update(String(value)).digest('hex');
}

// ─── Secrets-at-rest encryption (AES-256-GCM) ──────────────────────
// Used for company_settings values and integration configs that hold
// third-party API keys/passwords, so a database dump alone doesn't
// expose live credentials. The `enc:v1:` prefix lets decryptValue()
// pass pre-existing plaintext rows through unchanged (no migration
// needed) — they're re-encrypted automatically the next time they're saved.
const ENCRYPTION_PREFIX = 'enc:v1:';
let cachedKey = null;

function getEncryptionKey() {
  if (cachedKey) return cachedKey;
  const secret = process.env.ENCRYPTION_KEY || config.appKey;
  cachedKey = crypto.scryptSync(secret, 'dot-domino-crm-secrets', 32);
  return cachedKey;
}

export function encryptValue(plainText) {
  if (plainText == null || plainText === '') return plainText;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ENCRYPTION_PREFIX + Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptValue(stored) {
  if (stored == null || stored === '' || !String(stored).startsWith(ENCRYPTION_PREFIX)) return stored;
  try {
    const raw = Buffer.from(String(stored).slice(ENCRYPTION_PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export function safeEquals(expected, provided) {
  const left = Buffer.from(String(expected || ''));
  const raw = String(provided || '');
  const right = Buffer.from(raw.padEnd(left.length, '\0').slice(0, left.length));
  return raw.length === left.length && crypto.timingSafeEqual(left, right);
}

export function trackingUid(commId) {
  const payload = `${commId}:${hmac(commId)}`;
  return Buffer.from(payload).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeTrackingUid(uid) {
  try {
    const padded = String(uid).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(uid).length / 4) * 4, '=');
    const [commId, signature] = Buffer.from(padded, 'base64').toString('utf8').split(':');
    if (!commId || signature !== hmac(commId)) return null;
    return Number(commId) || null;
  } catch {
    return null;
  }
}

export { crypto };
