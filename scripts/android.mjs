// Build the Android app: web build -> cap sync -> Gradle. One source tree, two editions:
//   node scripts/android.mjs                   personal edition, debug APK (com.mitra247.musictools)
//   node scripts/android.mjs sync              personal: web build + cap sync only (no Gradle)
//   node scripts/android.mjs play-sync         play: web build + cap sync only (no Gradle)
//   node scripts/android.mjs play              Google Play edition: release AAB (com.mitra247.musicplayer)
//                                              + the clean check (scripts/check-play-clean.mjs)
//   node scripts/android.mjs play-apk          Google Play edition: debug APK for installing on a phone
// Needs JDK 21 (JAVA_HOME) and the Android SDK with platform 36 (ANDROID_HOME). On Windows a short
// TEMP folder is used: with the long temp path of some shells Gradle fails with "Unable to
// establish loopback connection" (AF_UNIX socket path too long).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formatBytes, root } from './lib.mjs';

const mode = process.argv[2] ?? 'debug';
const play = mode.startsWith('play');
const edition = play ? 'play' : 'personal';
const androidDir = path.join(root, 'app-android');
const gradleDir = path.join(androidDir, 'android');
const isWin = process.platform === 'win32';

const env = { ...process.env };
if (!env.ANDROID_HOME) {
  const guess = isWin
    ? path.join(env.LOCALAPPDATA ?? '', 'Android', 'Sdk')
    : path.join(os.homedir(), 'Android', 'Sdk');
  if (existsSync(guess)) env.ANDROID_HOME = guess;
}
if (!env.JAVA_HOME || !existsSync(path.join(env.JAVA_HOME, 'bin'))) {
  // A stale JAVA_HOME (JDK uninstalled) or none: look for an installed JDK 21.
  const base = 'C:/Program Files/Eclipse Adoptium';
  const found =
    isWin && existsSync(base) ? readdirSync(base).find((d) => d.startsWith('jdk-21')) : undefined;
  if (found) env.JAVA_HOME = path.join(base, found);
  else {
    delete env.JAVA_HOME;
    console.warn('JAVA_HOME is not set (JDK 21 needed); Gradle will use java from PATH.');
  }
}
if (!env.ANDROID_HOME) {
  console.error('ANDROID_HOME is not set and no SDK was found.');
  process.exit(2);
}
if (isWin) {
  const tmp = 'C:/gt';
  mkdirSync(tmp, { recursive: true });
  env.TEMP = tmp;
  env.TMP = tmp;
}

function run(cmd, args, cwd) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd, env, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) {
    console.error(`\nFailed: ${cmd} ${args.join(' ')} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

env.MUSIK_EDITION = edition;
if (play) {
  // Web app of the Play edition only: no server, and out/app (personal) stays as it is.
  rmSync(path.join(root, 'out', 'app-play'), { recursive: true, force: true });
  run(
    process.execPath,
    [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'],
    path.join(root, 'app-pwa'),
  );
} else {
  run(process.execPath, [path.join(root, 'scripts', 'build.mjs')], root);
}
// Both editions share one assets folder: start clean so no file of the other edition is left.
rmSync(path.join(gradleDir, 'app', 'src', 'main', 'assets', 'public'), {
  recursive: true,
  force: true,
});
run('npx', ['cap', 'sync', 'android'], androidDir);
if (mode === 'sync' || mode === 'play-sync') process.exit(0);

/**
 * Release signing without a password on disk. keystore.properties (git-ignored) only needs
 * storeFile and keyAlias; a missing password is asked here (hidden input) or taken from
 * MUSIK_STORE_PASSWORD, checked against the keystore at once (a wrong one would otherwise fail
 * minutes into the build), and handed to Gradle through its environment only.
 */
async function prepareSigning() {
  const propsFile = path.join(gradleDir, 'keystore.properties');
  const props = {};
  if (existsSync(propsFile)) {
    for (const line of readFileSync(propsFile, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) props[m[1]] = m[2];
    }
  }
  const storeFile = props.storeFile || env.MUSIK_STORE_FILE;
  if (!storeFile) {
    console.warn(
      '\nNo keystore configured (keystore.properties with storeFile, or MUSIK_STORE_FILE): the AAB will be UNSIGNED and cannot be uploaded to Google Play.',
    );
    return;
  }
  const keystorePath = path.resolve(gradleDir, storeFile);
  if (!existsSync(keystorePath)) {
    console.error(`\nKeystore not found: ${keystorePath}`);
    process.exit(1);
  }
  if (!props.storePassword && !env.MUSIK_STORE_PASSWORD) {
    env.MUSIK_STORE_PASSWORD = await askHidden(`Password of ${path.basename(keystorePath)}: `);
  }
  const password = props.storePassword || env.MUSIK_STORE_PASSWORD;
  const alias = props.keyAlias || env.MUSIK_KEY_ALIAS || 'upload';
  const keytool = path.join(env.JAVA_HOME ?? '', 'bin', isWin ? 'keytool.exe' : 'keytool');
  const check = spawnSync(
    keytool,
    ['-list', '-keystore', keystorePath, '-alias', alias, '-storepass:env', 'CHECK_PASS'],
    { env: { ...env, CHECK_PASS: password }, encoding: 'utf8' },
  );
  if (check.status !== 0) {
    const reason = ((check.stdout ?? '') + (check.stderr ?? '')).trim().split('\n').pop();
    console.error(`\nThe keystore password or the alias "${alias}" is wrong (keytool: ${reason}).`);
    process.exit(1);
  }
  console.log(`\nSigning with ${path.basename(keystorePath)} (alias ${alias}).`);
}

/** Read a line without echoing it (needs a terminal; otherwise set MUSIK_STORE_PASSWORD). */
function askHidden(question) {
  if (!process.stdin.isTTY) {
    console.error(
      '\nNo terminal to ask for the keystore password: run this in a terminal, or set MUSIK_STORE_PASSWORD for this one command.',
    );
    process.exit(1);
  }
  return new Promise((resolve) => {
    process.stdout.write(question);
    let value = '';
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        } else if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        } else if (ch === '\u007f' || ch === '\b') {
          value = value.slice(0, -1);
        } else {
          value += ch;
        }
      }
    };
    process.stdin.on('data', onData);
  });
}

const gradlew = path.join(gradleDir, isWin ? 'gradlew.bat' : 'gradlew');
const gradle = isWin ? `"${gradlew}"` : gradlew;
if (mode === 'play') {
  await prepareSigning();
  run(gradle, ['bundlePlayRelease'], gradleDir);
  const outputs = path.join(gradleDir, 'app', 'build', 'outputs');
  const aab = path.join(outputs, 'bundle', 'playRelease', 'app-play-release.aab');
  console.log(`\nAAB: ${aab} (${formatBytes(statSync(aab).size)})`);
  run(process.execPath, [path.join(root, 'scripts', 'check-play-clean.mjs'), aab], root);
} else {
  run(gradle, [play ? 'assemblePlayDebug' : 'assemblePersonalDebug'], gradleDir);
  const name = `app-${edition}-debug.apk`;
  const apk = path.join(gradleDir, 'app', 'build', 'outputs', 'apk', edition, 'debug', name);
  console.log(`\nAPK: ${apk} (${formatBytes(statSync(apk).size)})`);
}
