import http from 'node:http';
import { hasValidBearer } from './auth';
import { readBuildInfo, type BuildInfo } from './build-info';
import { configProblems, loadConfig, type Config } from './config';
import { getYtdlpVersion } from './ytdlp';

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
  extra: http.OutgoingHttpHeaders = {},
): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extra,
  });
  res.end(JSON.stringify(body));
}

export function createApp(config: Config, build: BuildInfo = readBuildInfo()): http.Server {
  const problems = configProblems(config);
  const configured = problems.length === 0;

  return http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');

    // Public: health only.
    if (req.method === 'GET' && url.pathname === '/api/health') {
      void getYtdlpVersion(config.ytdlpPath).then((ytdlp) =>
        sendJson(res, 200, {
          status: 'ok',
          version: build.version,
          commit: build.commit,
          builtAt: build.builtAt,
          node: process.version,
          ytdlp,
          configured,
        }),
      );
      return;
    }

    // Everything else requires a configured token and a valid Bearer header.
    if (!configured || !config.token) {
      sendJson(res, 503, { error: 'server_not_configured', message: problems.join(' ') });
      return;
    }
    if (!hasValidBearer(req, config.token)) {
      sendJson(
        res,
        401,
        { error: 'unauthorized', message: 'Missing or invalid bearer token.' },
        { 'www-authenticate': 'Bearer' },
      );
      return;
    }

    // Authenticated, but the download logic arrives in M2.
    sendJson(res, 501, {
      error: 'not_implemented',
      message: 'Not implemented yet (planned for M2).',
    });
  });
}

function main(): void {
  const config = loadConfig();
  for (const p of configProblems(config)) console.warn(`[musik] WARNING: ${p}`);
  const server = createApp(config);
  server.listen(config.port, () => {
    // Never log the token.
    console.log(`[musik] listening on ${config.port}`);
  });
}

if (require.main === module) main();
