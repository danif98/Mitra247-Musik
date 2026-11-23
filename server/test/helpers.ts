import fs from 'node:fs';
import type http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createApp, type App } from '../src/server';
import { loadConfig } from '../src/config';

export const FAKE_YTDLP = path.join(__dirname, 'fake-ytdlp.cjs');
export const TOKEN = 'a1b2c3d4'.repeat(8);

export function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'musik-srv-'));
}

export async function until(cond: () => boolean, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 15));
  }
}

/** Remove a temp folder; Windows keeps folders locked while a child process is still running. */
export function removeDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {
    /* temp folder: leaving it behind is harmless */
  }
}

export interface Started {
  app: App;
  base: string;
  dataDir: string;
  close: () => Promise<void>;
}

/** Start the real HTTP app on a random port with the fake yt-dlp. */
export async function startApp(
  env: Record<string, string> = {},
  deps: { now?: () => number } = {},
): Promise<Started> {
  const dataDir = tempDir();
  const config = loadConfig({
    MUSIK_TOKEN: TOKEN,
    YTDLP_PATH: process.execPath,
    DATA_DIR: dataDir,
    TRUST_PROXY: 'false',
    ...env,
  });
  const app = createApp(
    config,
    { version: 't', commit: null, builtAt: null },
    { ytdlpPrefixArgs: [FAKE_YTDLP], quiet: true, ...deps },
  );
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  return {
    app,
    base,
    dataDir,
    close: async () => {
      await until(() => app.jobs.counts().active === 0, 5000).catch(() => undefined);
      await new Promise<void>((r) => (app.server as http.Server).close(() => r()));
      removeDir(dataDir);
    },
  };
}

export const auth = { authorization: `Bearer ${TOKEN}` };
export const json = { 'content-type': 'application/json' };
