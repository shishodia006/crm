// Lightweight in-memory rate limiter — no new dependency needed.
// Note: this is per-process state. If this API is ever run as multiple
// instances behind a load balancer, swap the Map for a shared store
// (e.g. Redis) so limits are enforced across all instances.
const buckets = new Map();

export function rateLimit({ windowMs = 15 * 60 * 1000, max = 10, keyFn } = {}) {
  return (req, res, next) => {
    const key = `${req.path}:${keyFn ? keyFn(req) : req.ip}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, message: 'Too many attempts. Please try again later.', errors: null });
    }
    next();
  };
}

// Periodic cleanup so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();
