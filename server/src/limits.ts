/** Rate limiting and failed-auth lockout. The clock is injectable so tests need no real waiting. */

export type Clock = () => number;

export interface LimitResult {
  allowed: boolean;
  /** Milliseconds until the next request would be allowed (0 when allowed). */
  retryAfterMs: number;
}

/** Sliding-window counter per key. */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: Clock = Date.now,
  ) {}

  hit(key: string): LimitResult {
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => x > t - this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { allowed: false, retryAfterMs: recent[0]! + this.windowMs - t };
    }
    recent.push(t);
    this.hits.set(key, recent);
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Drop idle keys (call periodically). */
  prune(): void {
    const t = this.now();
    for (const [key, list] of this.hits) {
      if (list.every((x) => x <= t - this.windowMs)) this.hits.delete(key);
    }
  }
}

export interface LockoutOptions {
  maxFailures: number;
  windowMs: number;
  blockMs: number;
}

/** Blocks an IP for a while after too many wrong tokens. */
export class AuthLockout {
  private readonly failures = new Map<string, number[]>();
  private readonly blockedUntil = new Map<string, number>();

  constructor(
    private readonly opts: LockoutOptions,
    private readonly now: Clock = Date.now,
  ) {}

  /** 0 when not blocked, else remaining block time in ms. */
  blockedFor(ip: string): number {
    const until = this.blockedUntil.get(ip) ?? 0;
    const left = until - this.now();
    if (left <= 0) {
      this.blockedUntil.delete(ip);
      return 0;
    }
    return left;
  }

  recordFailure(ip: string): void {
    const t = this.now();
    const recent = (this.failures.get(ip) ?? []).filter((x) => x > t - this.opts.windowMs);
    recent.push(t);
    if (recent.length >= this.opts.maxFailures) {
      this.blockedUntil.set(ip, t + this.opts.blockMs);
      this.failures.delete(ip);
    } else {
      this.failures.set(ip, recent);
    }
  }

  recordSuccess(ip: string): void {
    this.failures.delete(ip);
  }
}
