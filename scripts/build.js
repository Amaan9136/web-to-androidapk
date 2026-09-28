#!/usr/bin/env node
'use strict';
/**
 * Full build pipeline for one profile:
 *   1. Generate the Android project (bubblewrap init logic) if not present
 *   2. Patch build.gradle to guarantee targetSdkVersion 36 compliance
 *   3. Run the Gradle wrapper to produce app-release.aab and an unsigned APK
 *   4. Sign the APK with the profile's keystore and save it as app-release.apk
 *
 * Usage:
 *   npm run build -- --profile seeze
 *   npm run build -- --profile seeze --skip-build   (scaffold + patch only)
 */
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('../lib/args');
const { loadProfile } = require('../lib/profile');
const { log, ok, warn, fail, run, tryRun } = require('../lib/shell');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profileName = args.profile || args._[0];
  const profile = loadProfile(profileName);

  // Zoom is controlled entirely by the website's own viewport tag (see
  // scripts/check-viewport.js) — check it before scaffolding so a missing
  // "user-scalable=no" is caught immediately instead of after Play review.
  // Zoom must never be possible in a generated app, so this check is
  // --strict by default: a live site that doesn't disable scaling fails the
  // build. --allow-zoom explicitly opts out of that block.
  if (args['allow-zoom']) {
    tryRun(process.execPath, [path.join(__dirname, 'check-viewport.js'), '--profile', profile._name]);
  } else {
    const viewportRes = tryRun(process.execPath, [path.join(__dirname, 'check-viewport.js'), '--profile', profile._name, '--strict']);
    if (viewportRes.status !== 0) {
      fail('Build aborted: the live site does not disable pinch/double-tap zoom (see above). Fix the viewport tag, or pass --allow-zoom to build anyway.');
      process.exit(1);
    }
  }

  const projectExists = fs.existsSync(path.join(profile._outputDir, 'app', 'build.gradle'));

  if (!projectExists) {
    log('No existing project found — scaffolding first...');
    run(process.execPath, [path.join(__dirname, 'init.js'), '--profile', profile._name]);
  } else {
    log(`Existing project found at ${profile._outputDir}, skipping scaffold (delete the folder to regenerate).`);
  }

  // Always patch after scaffold, defensively, before every build.
  run(process.execPath, [path.join(__dirname, 'patch-gradle.js'), '--profile', profile._name]);
  run(process.execPath, [path.join(__dirname, 'patch-theme.js'), '--profile', profile._name]);

  if (args['skip-build']) {
    ok('Skipping Gradle build (--skip-build set). Project is scaffolded and patched.');
    return;
  }

  if (!fs.existsSync(profile._keystorePath)) {
    warn(`Keystore not found at ${profile._keystorePath}.`);
    warn('Generate one first: npm run sign -- --profile ' + profile._name + ' --generate-key');
    warn('Continuing — Gradle build will still produce an UNSIGNED bundle and an UNSIGNED APK.');
  }

  const gradlewName = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const gradlewPath = path.join(profile._outputDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');

  if (!fs.existsSync(gradlewPath)) {
    fail(`Gradle wrapper missing at ${gradlewPath}. The scaffold step may have failed.`);
    process.exit(1);
  }
  if (process.platform !== 'win32') {
    fs.chmodSync(gradlewPath, 0o755);
  }

  log('Running Gradle build (this downloads Gradle + Android build tools on first run — can take several minutes)...');

  const tasks = ['bundleRelease', 'assembleRelease'];

  if (process.platform === 'win32') {
    run([gradlewName, ...tasks].join(' '), [], { cwd: profile._outputDir, shell: true });
  } else {
    run(gradlewName, tasks, { cwd: profile._outputDir });
  }

  const aabPath = path.join(profile._outputDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
  const unsignedApkPath = path.join(profile._outputDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release-unsigned.apk');
  const apkPath = path.join(profile._outputDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
  if (fs.existsSync(unsignedApkPath) && fs.existsSync(profile._keystorePath)) {
    run(process.execPath, [path.join(__dirname, 'sign.js'), '--profile', profile._name, '--file', unsignedApkPath]);
  }

  console.log('');
  ok('Build complete.');
  if (fs.existsSync(aabPath)) ok(`AAB: ${aabPath}`);
  if (fs.existsSync(unsignedApkPath)) warn(`APK is unsigned: ${unsignedApkPath} — generate a keystore, then run: npm run sign -- --profile ${profile._name} --file "${unsignedApkPath}"`);
  else if (fs.existsSync(apkPath)) ok(`APK (signed): ${apkPath}`);
  log('If the bundle is not yet signed, run: npm run sign -- --profile ' + profile._name);
  log('Then verify with: npm run verify -- --profile ' + profile._name);
}

main().catch((e) => {
  fail(e.message);
  process.exit(1);
});