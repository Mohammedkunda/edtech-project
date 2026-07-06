/**
 * Simple per-key token-bucket rate limiter.
 * Keys are typically `${userId}` or `${userId}:${documentId}`.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; last: number }>();
  private maxTokens: number;
  private refillRate: number; // tokens per millisecond

  constructor(updatesPerSec: number, burst: number) {
    this.maxTokens = burst;
    this.refillRate = updatesPerSec / 1000;
  }

  allow(key: string): boolean {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.maxTokens, last: now };
      this.buckets.set(key, b);
    }
    // Refill tokens based on elapsed time.
    b.tokens = Math.min(this.maxTokens, b.tokens + (now - b.last) * this.refillRate);
    b.last = now;

    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
}
