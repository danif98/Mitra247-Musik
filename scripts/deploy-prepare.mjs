// Copy the build output (out/) into the `musik-deploy` git repo folder and prepare it for a manual commit.
//
//   MUSIK_DEPLOY_DIR=<path> node scripts/deploy-prepare.mjs   (default: ../musik-deploy)
//
// Layout written to the deploy folder:
//   app/                static PWA (point the web server / public_html symlink here)
//   server/             compiled Node service (startup file: server/app.js)
//   api/auth.php        sign-in check (PHP + MySQL), served at /api/auth.php; api/auth-config.php
//                       (secrets, created once on the server) is git-ignored and never touched here
//   package.json        production manifest for the Node app (no devDependencies)
//   package-lock.json   production lockfile
//   VERSION             build version line
//   .gitignore          keeps secrets, vendor.zip and node_modules out of git
// It never writes vendor.zip or any secret, and never pushes anything.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitInfo, listFiles, readJson, root, runNpm } from './lib.mjs';

const MANAGED = [
  'app',
  'server',
  'package.json',
  'package-lock.json',
  'VERSION',
  '.gitignore',
  'README.md',
];

const DEPLOY_GITIGNORE = `# Never commit secrets or heavy artefacts to the deploy repo
.env
.env.*
vendor.zip
node_modules/
data/
tmp/
*.log
api/auth-config.php
`;

const DEPLOY_README = `# musik-deploy

Build output of the \`musik\` source repo. Do not edit by hand: regenerate with \`npm run deploy:prepare\`
in the source repo. See docs/DEPLOY.md in the source repo for the full procedure.

- \`app/\` static PWA
- \`server/\` Node service (startup file \`server/app.js\`); configuration only via environment variables
- \`api/auth.php\` sign-in check (PHP + MySQL) at \`/api/auth.php\`; its secrets live in \`api/auth-config.php\` (created once on the server, git-ignored). See \`server-auth/README.md\` in the source repo
- \`vendor.zip\` (pure JS dependencies) is uploaded separately and is NOT in this repo
`;

/** Patterns that must never appear in a deploy folder. Returns a list of problems. */
export function scanDeployForSecrets(dir) {
  const problems = [];
  for (const rel of listFiles(dir)) {
    const base = rel.split('/').pop() ?? '';
    if (/^\.env(\..*)?$/.test(base) && base !== '.env.example') problems.push(`${rel}: env file`);
    if (base === 'vendor.zip') problems.push(`${rel}: vendor.zip must not be in the deploy repo`);
    if (rel.startsWith('.git/')) continue;
    const full = path.join(dir, ...rel.split('/'));
    if (statSync(full).size > 2 * 1024 * 1024) continue; // skip big binaries (wasm etc.)
    if (/\.(png|wasm|ico|woff2?)$/.test(base)) continue;
    const text = readFileSync(full, 'utf8');
    if (/MUSIK_TOKEN\s*[=:]\s*["']?[A-Za-z0-9+/_-]{16,}/.test(text)) {
      problems.push(`${rel}: looks like a MUSIK_TOKEN value`);
    }
    if (
      /Bearer\s+[A-Za-z0-9._~+/-]{24,}/.test(text) &&
      !/Bearer\\s|Bearer\s\+|\^Bearer/.test(text)
    ) {
      problems.push(`${rel}: looks like a bearer token`);
    }
    if (/[0-9a-f]{64}/i.test(text) && rel.endsWith('.json') && !rel.endsWith('package-lock.json')) {
      problems.push(`${rel}: contains a 64-char hex string (possible secret)`);
    }
  }
  return problems;
}

function main() {
  const out = path.join(root, 'out');
  if (
    !existsSync(path.join(out, 'app', 'sw.js')) ||
    !existsSync(path.join(out, 'server', 'app.js'))
  ) {
    console.error('Build output missing. Run `npm run build` first.');
    process.exit(1);
  }
  const deployDir = path.resolve(
    process.env.MUSIK_DEPLOY_DIR || path.join(root, '..', 'musik-deploy'),
  );
  if (deployDir === root || deployDir.startsWith(root + path.sep + 'docs')) {
    console.error('Refusing to use the source repo as the deploy folder.');
    process.exit(1);
  }
  if (!existsSync(deployDir)) {
    mkdirSync(deployDir, { recursive: true });
    console.log(`Created ${deployDir} (run \`git init\` there, see steps below).`);
  } else {
    // Safety: only touch folders that are empty, a git repo, or a previous deploy folder.
    const entries = readdirSync(deployDir);
    const looksSafe =
      entries.length === 0 || entries.includes('.git') || entries.includes('VERSION');
    if (!looksSafe) {
      console.error(`Refusing to write into ${deployDir}: not empty and not a deploy folder.`);
      process.exit(1);
    }
  }

  // Replace managed entries only (keep .git and anything else the user added).
  for (const name of MANAGED) rmSync(path.join(deployDir, name), { recursive: true, force: true });
  cpSync(path.join(out, 'app'), path.join(deployDir, 'app'), { recursive: true });
  cpSync(path.join(out, 'server'), path.join(deployDir, 'server'), { recursive: true });
  // api/: only the managed files; api/auth-config.php (secrets on the server) is never touched.
  mkdirSync(path.join(deployDir, 'api'), { recursive: true });
  for (const [from, to] of [
    [path.join('server-auth', 'public', 'auth.php'), 'auth.php'],
    [path.join('server-auth', 'auth-config.example.php'), 'auth-config.example.php'],
  ]) {
    cpSync(path.join(root, from), path.join(deployDir, 'api', to));
  }

  const rootPkg = readJson(path.join(root, 'package.json'));
  const serverPkg = readJson(path.join(root, 'server', 'package.json'));
  const prodPkg = {
    name: 'musik-server',
    version: rootPkg.version,
    private: true,
    license: rootPkg.license,
    description: 'Musik Tools server (production build)',
    main: 'server/app.js',
    engines: serverPkg.engines,
    scripts: { start: 'node server/app.js' },
    dependencies: serverPkg.dependencies ?? {},
  };
  writeFileSync(path.join(deployDir, 'package.json'), JSON.stringify(prodPkg, null, 2) + '\n');
  writeFileSync(path.join(deployDir, '.gitignore'), DEPLOY_GITIGNORE);
  writeFileSync(path.join(deployDir, 'README.md'), DEPLOY_README);

  const { commit, dirty } = gitInfo();
  const info = readJson(path.join(out, 'server', 'build-info.json'));
  const versionLine = `${info.version}${commit ? `+${commit}${dirty ? '-dirty' : ''}` : ''} built ${info.builtAt}`;
  writeFileSync(path.join(deployDir, 'VERSION'), versionLine + '\n');

  // Production lockfile (only the production dependencies of server/package.json).
  runNpm(
    ['install', '--package-lock-only', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'],
    {
      cwd: deployDir,
      stdio: 'pipe',
    },
  );

  const problems = scanDeployForSecrets(deployDir);
  if (problems.length) {
    console.error('Deploy folder failed the secret scan:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  const tag = `v${info.version}`;
  console.log(`\nDeploy folder ready: ${deployDir}`);
  console.log(`VERSION: ${versionLine}`);
  console.log(`Files: ${listFiles(deployDir).filter((f) => !f.startsWith('.git/')).length}`);
  console.log(`
Next steps (run manually; nothing was committed or pushed):

  cd ${deployDir}
  git init                 # first time only, then: git remote add origin <musik-deploy repo url>
  git add -A
  git commit -m "build: ${info.version}${commit ? ` (${commit})` : ''}"
  git tag ${tag}           # for rollback
  git push origin HEAD --tags

Then on the server: git pull, then restart (see docs/DEPLOY.md).
`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
