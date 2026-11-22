import { describe, expect, it } from 'vitest';
import { AuthLockout, SlidingWindowLimiter } from './limits';
import { LINK_TTL_MS, signLink, verifyLink } from './signing';

function fakeClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('SlidingWindowLimiter', () => {
  it('allows up to the limit per key and recovers after the window', () => {
    const c = fakeClock();
    const l = new SlidingWindowLimiter(3, 10_000, c.now);
    expect([1, 2, 3].map(() => l.hit('a').allowed)).toEqual([true, true, true]);
    const denied = l.hit('a');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(10_000);
    expect(l.hit('b').allowed).toBe(true); // separate key
    c.advance(10_001);
    expect(l.hit('a').allowed).toBe(true);
  });
  it('prune drops idle keys', () => {
    const c = fakeClock();
    const l = new SlidingWindowLimiter(1, 1000, c.now);
    l.hit('x');
    c.advance(5000);
    l.prune();
    expect(l.hit('x').allowed).toBe(true);
  });
});

describe('AuthLockout', () => {
  const opts = { maxFailures: 3, windowMs: 60_000, blockMs: 300_000 };
  it('blocks an IP after repeated failures, only that IP, then releases', () => {
    const c = fakeClock();
    const g = new AuthLockout(opts, c.now);
    g.recordFailure('1.1.1.1');
    g.recordFailure('1.1.1.1');
    expect(g.blockedFor('1.1.1.1')).toBe(0);
    g.recordFailure('1.1.1.1');
    expect(g.blockedFor('1.1.1.1')).toBe(300_000);
    expect(g.blockedFor('2.2.2.2')).toBe(0);
    c.advance(299_000);
    expect(g.blockedFor('1.1.1.1')).toBe(1000);
    c.advance(1500);
    expect(g.blockedFor('1.1.1.1')).toBe(0);
  });
  it('failures outside the window do not add up; success resets', () => {
    const c = fakeClock();
    const g = new AuthLockout(opts, c.now);
    g.recordFailure('a');
    g.recordFailure('a');
    c.advance(61_000);
    g.recordFailure('a');
    expect(g.blockedFor('a')).toBe(0);
    g.recordFailure('a');
    g.recordSuccess('a');
    g.recordFailure('a');
    expect(g.blockedFor('a')).toBe(0);
  });
});

describe('signed download links', () => {
  const token = 'x'.repeat(40);
  const id = 'a'.repeat(32);
  it('verifies, expires and rejects tampering', () => {
    const t0 = 5_000_000;
    const { exp, sig } = signLink(token, id, t0);
    expect(verifyLink(token, id, String(exp), sig, t0 + 1000)).toBe(true);
    expect(verifyLink(token, id, String(exp), sig, t0 + LINK_TTL_MS + 1)).toBe(false);
    expect(verifyLink(token, 'b'.repeat(32), String(exp), sig, t0)).toBe(false);
    expect(verifyLink('other-token'.repeat(4), id, String(exp), sig, t0)).toBe(false);
    expect(verifyLink(token, id, String(exp + 1), sig, t0)).toBe(false);
    expect(verifyLink(token, id, String(exp), sig.slice(0, 63) + '0', t0)).toBe(false);
    expect(verifyLink(token, id, null, sig, t0)).toBe(false);
    expect(verifyLink(token, id, String(exp), 'zz', t0)).toBe(false);
  });
});
