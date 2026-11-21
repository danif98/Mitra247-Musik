import { spawn, type ChildProcess } from 'node:child_process';

/**
 * Returns the yt-dlp version string, or null when the path is not configured or the call fails.
 * Uses spawn with an argument array (never a shell string).
 */
export function getYtdlpVersion(
  ytdlpPath: string | undefined,
  timeoutMs = 5000,
): Promise<string | null> {
  if (!ytdlpPath) return Promise.resolve(null);
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    let child: ChildProcess;
    const timer = setTimeout(() => {
      child?.kill();
      done(null);
    }, timeoutMs);
    function done(value: string | null): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }
    try {
      child = spawn(ytdlpPath, ['--version'], {
        stdio: ['ignore', 'pipe', 'ignore'],
        shell: false,
      });
    } catch {
      done(null);
      return;
    }
    child.stdout?.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', () => done(null));
    child.on('close', (code) => done(code === 0 ? out.trim().slice(0, 64) || null : null));
  });
}
