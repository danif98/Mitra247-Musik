/**
 * Startup file (cPanel "Application startup file" = server/app.js).
 *
 * It always starts the server when loaded. Passenger / CloudLinux load this file with their own
 * wrapper (`require(...)`), so a `require.main === module` guard would never fire and the app would
 * stay silent (the visitor gets a 503). The testable code lives in ./server.
 */
import path from 'node:path';
import { configProblems, loadConfig, loadDotEnv } from './config';
import { createApp } from './server';

// Local runs and servers without the cPanel variable form: read ./.env if present
// (variables that already exist in the environment win).
const loaded = loadDotEnv(path.join(process.cwd(), '.env'));
if (loaded.length) console.log(`[musik] loaded from .env: ${loaded.join(', ')}`);

const config = loadConfig();
for (const problem of configProblems(config)) console.warn(`[musik] WARNING: ${problem}`);

const { server } = createApp(config);
// Passenger replaces listen() so that the port is ignored when running under it.
server.listen(config.port, () => {
  // Never log the token.
  console.log(`[musik] listening on ${config.port}`);
});
