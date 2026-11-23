// Build the Android debug APK: web build -> cap sync -> Gradle.
//   node scripts/android.mjs          build + sync + assembleDebug
//   node scripts/android.mjs sync     build + sync only (no Gradle)
// Needs JDK 21 (JAVA_HOME) and the Android SDK with platform 36 (ANDROID_HOME). On Windows a short
// TEMP folder is used: with the long temp path of some shells Gradle fails with "Unable to
// establish loopback connection" (AF_UNIX socket path too long).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { formatBytes, root } from './lib.mjs';

const mode = process.argv[2] ?? 'debug';
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

run(process.execPath, [path.join(root, 'scripts', 'build.mjs')], root);
run('npx', ['cap', 'sync', 'android'], androidDir);
if (mode === 'sync') process.exit(0);

const gradlew = path.join(gradleDir, isWin ? 'gradlew.bat' : 'gradlew');
run(isWin ? `"${gradlew}"` : gradlew, ['assembleDebug'], gradleDir);
const apk = path.join(gradleDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
console.log(`\nAPK: ${apk} (${formatBytes(statSync(apk).size)})`);
