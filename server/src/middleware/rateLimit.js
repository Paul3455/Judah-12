import { HttpError } from './errors.js';

/**
 * Small in-memory fixed-window limiter.
 * Single-process only; see docs/DEPLOYMENT.md for running with a shared store.
 */
export function rateLimit({ windowMs, limit, key = (req) => req.ip, message }) {
  const buckets = new Map();

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [k, bucket] of buckets) {
      if (bucket.reset <= now) buckets.delete(k);
    }
  }, 60_000);
  sweeper.unref?.();

  return function limiter(req, res, next) {
    const bucketKey = key(req);
    const now = Date.now();
    let bucket = buckets.get(bucketKey);
    if (!bucket || bucket.reset <= now) {
      bucket = { count: 0, reset: now + windowMs };
      buckets.set(bucketKey, bucket);
    }
    bucket.count += 1;

    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil((bucket.reset - now) / 1000)));

    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.reset - now) / 1000)));
      return next(new HttpError(429, message || 'Too many requests. Please wait a moment.', 'rate_limited'));
    }
    return next();
  };
}
