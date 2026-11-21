import type { AddressInfo } from 'node:net';
import type http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { configProblems, loadConfig } from './config';
import { safeEqual } from './auth';

const TOKEN = 'a'.repeat(48);
const build = { version: '1.2.3', commit: null, builtAt: null };
let server: http.Server | undefined;

async function start(env: NodeJS.ProcessEnv) {
  server = createApp(loadConfig(env), build);
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

describe('server skeleton', () => {
  it('GET /api/health works without a token and reports the build version', async () => {
    const base = await start({ MUSIK_TOKEN: TOKEN });
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'ok', version: '1.2.3', ytdlp: null, configured: true });
  });

  it('health works without MUSIK_TOKEN, other endpoints fail with a clear message', async () => {
    const base = await start({});
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
    const res = await fetch(`${base}/api/jobs`, { method: 'POST' });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('server_not_configured');
    expect(body.message).toMatch(/MUSIK_TOKEN is not set/);
  });

  it('treats a too-short token as not configured', () => {
    expect(configProblems(loadConfig({ MUSIK_TOKEN: 'short' })).join()).toMatch(/shorter than/);
  });

  it('rejects requests without or with a wrong token (401)', async () => {
    const base = await start({ MUSIK_TOKEN: TOKEN });
    expect((await fetch(`${base}/api/jobs`, { method: 'POST' })).status).toBe(401);
    const bad = await fetch(`${base}/api/jobs`, {
      method: 'POST',
      headers: { authorization: `Bearer ${'b'.repeat(48)}` },
    });
    expect(bad.status).toBe(401);
    const wrongScheme = await fetch(`${base}/api/jobs`, { headers: { authorization: TOKEN } });
    expect(wrongScheme.status).toBe(401);
  });

  it('accepts the correct token (placeholder 501 until M2)', async () => {
    const base = await start({ MUSIK_TOKEN: TOKEN });
    const res = await fetch(`${base}/api/jobs`, {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(501);
  });

  it('unknown paths also require the token', async () => {
    const base = await start({ MUSIK_TOKEN: TOKEN });
    expect((await fetch(`${base}/nope`)).status).toBe(401);
  });

  it('safeEqual compares correctly across lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });

  it('reports the yt-dlp version via spawn when YTDLP_PATH is a working executable', async () => {
    // node itself as a stand-in: `node --version` prints a version and exits 0.
    const base = await start({ MUSIK_TOKEN: TOKEN, YTDLP_PATH: process.execPath });
    const body = await (await fetch(`${base}/api/health`)).json();
    expect(body.ytdlp).toBe(process.version);
  });

  it('health survives a bad YTDLP_PATH', async () => {
    const base = await start({ MUSIK_TOKEN: TOKEN, YTDLP_PATH: '/definitely/not/here' });
    const body = await (await fetch(`${base}/api/health`)).json();
    expect(body.ytdlp).toBeNull();
  });
});
