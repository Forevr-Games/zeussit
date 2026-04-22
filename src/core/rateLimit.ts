interface Bucket {
  count: number;
  windowStart: number;
}
export interface RateLimiterOpts {
  perMin: number;
}
export type RateLimiter = (userId: string) => boolean;

const MAX_BUCKETS = 10_000;
const WINDOW_MS = 60_000;

export function createRateLimiter({ perMin }: RateLimiterOpts): RateLimiter {
  const buckets = new Map<string, Bucket>();
  return (userId) => {
    const now = Date.now();
    const b = buckets.get(userId);
    if (!b || now - b.windowStart >= WINDOW_MS) {
      if (buckets.size >= MAX_BUCKETS) {
        for (const [k, v] of buckets) {
          if (now - v.windowStart >= WINDOW_MS) buckets.delete(k);
        }
      }
      buckets.set(userId, { count: 1, windowStart: now });
      return true;
    }
    if (b.count >= perMin) return false;
    b.count++;
    return true;
  };
}
