import path from 'node:path';

export interface Config {
  port: number;
  /** Shared secret for Bearer auth. Undefined means the server is not configured. */
  token: string | undefined;
  ytdlpPath: string | undefined;
  ffmpegPath: string | undefined;
  dataDir: string;
}

/** Minimum token length (the PRD asks for >= 32 random bytes; hex/base64 of that is >= 43 chars). */
export const MIN_TOKEN_LENGTH = 32;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env['PORT'] ?? 3000);
  const token = env['MUSIK_TOKEN']?.trim() || undefined;
  return {
    port: Number.isInteger(port) && port >= 0 && port < 65536 ? port : 3000,
    token,
    ytdlpPath: env['YTDLP_PATH']?.trim() || undefined,
    ffmpegPath: env['FFMPEG_PATH']?.trim() || undefined,
    dataDir: path.resolve(env['DATA_DIR']?.trim() || path.join(process.cwd(), 'data')),
  };
}

/** Human readable configuration problems; empty when the server is fully usable. */
export function configProblems(config: Config): string[] {
  const problems: string[] = [];
  if (!config.token) {
    problems.push('MUSIK_TOKEN is not set. All endpoints except GET /api/health are disabled.');
  } else if (config.token.length < MIN_TOKEN_LENGTH) {
    problems.push(
      `MUSIK_TOKEN is shorter than ${MIN_TOKEN_LENGTH} characters. All endpoints except GET /api/health are disabled.`,
    );
  }
  return problems;
}
