import crypto from 'crypto';
import { config } from '../config/index.js';

export function hmac(value) {
  return crypto.createHmac('sha256', config.appKey).update(String(value)).digest('hex');
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
