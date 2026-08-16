export function createPublicRequestGuard({
  windowMs = 60_000,
  // Ten one-second scoreboards can legitimately share one household, office,
  // or reverse-proxy address. Provider quota remains enforced separately.
  maxRequests = 600,
  maxEntries = 1_000,
  maxConcurrent = 100,
  now = () => Date.now(),
} = {}) {
  const buckets = new Map();
  let concurrent = 0;

  function cleanup(nowMs) {
    for (const [key, bucket] of buckets) {
      bucket.timestamps = bucket.timestamps.filter((timestamp) => nowMs - timestamp < windowMs);
      if (!bucket.timestamps.length) buckets.delete(key);
    }
    if (buckets.size <= maxEntries) return;
    [...buckets.entries()]
      .sort(([, left], [, right]) => left.lastSeenAt - right.lastSeenAt)
      .slice(0, buckets.size - maxEntries)
      .forEach(([key]) => buckets.delete(key));
  }

  return function publicRequestGuard(req, res, next) {
    const nowMs = now();
    cleanup(nowMs);
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const bucket = buckets.get(key) ?? { timestamps: [], lastSeenAt: nowMs };
    bucket.timestamps = bucket.timestamps.filter((timestamp) => nowMs - timestamp < windowMs);
    bucket.lastSeenAt = nowMs;
    if (bucket.timestamps.length >= maxRequests) {
      const retryAfterMs = Math.max(1_000, windowMs - (nowMs - bucket.timestamps[0]));
      return res
        .status(429)
        .set('Cache-Control', 'no-store')
        .set('Retry-After', String(Math.ceil(retryAfterMs / 1_000)))
        .json({ ok: false, error: 'Statistics Scores is receiving too many requests. Try again shortly.' });
    }
    if (concurrent >= maxConcurrent) {
      return res
        .status(503)
        .set('Cache-Control', 'no-store')
        .set('Retry-After', '1')
        .json({ ok: false, error: 'Statistics Scores is busy. Try again shortly.' });
    }
    bucket.timestamps.push(nowMs);
    buckets.set(key, bucket);
    concurrent += 1;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      concurrent = Math.max(0, concurrent - 1);
    };
    res.once('finish', release);
    res.once('close', release);
    return next();
  };
}
