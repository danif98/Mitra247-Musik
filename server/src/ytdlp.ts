import { spawn, type ChildProcess } from 'node:child_process';

export type YtdlpProblem = 'not_configured' | 'not_found' | 'not_executable' | 'timeout' | 'failed';

export interface YtdlpInfo {
  version: string | null;
  /** Why the version could not be read; null when it could. Contains no paths or secrets. */
  problem: YtdlpProblem | null;
}

/**
 * Runs `yt-dlp --version` (spawn with an argument array, never a shell string) and reports the
 * version or a coarse reason for failing, so a bad YTDLP_PATH is easy to diagnose from /api/health.
 */
export function getYtdlpInfo(ytdlpPath: string | undefined, timeoutMs = 5000): Promise<YtdlpInfo> {
  if (!ytdlpPath) return Promise.resolve({ version: null, problem: 'not_configured' });
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    let child: ChildProcess | undefined;
    const timer = setTimeout(() => {
      child?.kill();
      done({ version: null, problem: 'timeout' });
    }, timeoutMs);
    function done(info: YtdlpInfo): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(info);
    }
    try {
      child = spawn(ytdlpPath, ['--version'], {
        stdio: ['ignore', 'pipe', 'ignore'],
        shell: false,
      });
    } catch {
      done({ version: null, problem: 'not_executable' });
      return;
    }
    child.stdout?.on('data', (d: Buffer) => (out += d.toString()));
    child.on('error', (err: NodeJS.ErrnoException) => {
      done({
        version: null,
        problem: err.code === 'ENOENT' ? 'not_found' : 'not_executable',
      });
    });
    child.on('close', (code) => {
      const version = out.trim().slice(0, 64);
      done(
        code === 0 && version ? { version, problem: null } : { version: null, problem: 'failed' },
      );
    });
  });
}

/** Version string, or null when it cannot be read. */
export async function getYtdlpVersion(
  ytdlpPath: string | undefined,
  timeoutMs = 5000,
): Promise<string | null> {
  return (await getYtdlpInfo(ytdlpPath, timeoutMs)).version;
}
