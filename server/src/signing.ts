import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** Short-lived download links: /api/files/<id>.mp3?exp=<ms epoch>&sig=<hex hmac>. */

export const LINK_TTL_MS = 5 * 60 * 1000;

function key(token: string): Buffer {
  return createHash('sha256').update(`musik-link:${token}`).digest();
}

function mac(token: string, id: string, exp: number): Buffer {
  return createHmac('sha256', key(token)).update(`${id}.${exp}`).digest();
}

export function signLink(token: string, id: string, now: number, ttlMs = LINK_TTL_MS) {
  const exp = now + ttlMs;
  return { exp, sig: mac(token, id, exp).toString('hex') };
}

export function verifyLink(
  token: string,
  id: string,
  exp: string | null,
  sig: string | null,
  now: number,
): boolean {
  if (!exp || !sig || !/^\d{1,16}$/.test(exp) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  const expNum = Number(exp);
  if (expNum < now) return false;
  const expected = mac(token, id, expNum);
  const given = Buffer.from(sig, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
