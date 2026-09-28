#!/usr/bin/env node
'use strict';
/**
 * Post-build sanity checks:
 *  - Confirms the AAB is signed (or the APK, when --apk is passed)
 *  - Confirms targetSdkVersion meets current Play Store requirements
 *  - Reminds you to check assetlinks.json (Digital Asset Links) is live,
 *    since a mismatched fingerprint is the #1 cause of TWAs falling back
 *    to a browser address bar instead of running fullscreen.
 *
 * Usage: node scripts/verify.js --profile seeze [--apk]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');
const { parseArgs } = require('../lib/args');
const { loadProfile } = require('../lib/profile');
const { log, ok, warn, fail, tryRun, apksignerCommand } = require('../lib/shell');

function fetchJson(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { 'User-Agent': 'webtwa-toolkit-verify' }, timeout: 15000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

const REQUIRED_MIN_TARGET_SDK = 36; // Update as Play Store policy advances.

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profileName = args.profile || args._[0];
  const profile = loadProfile(profileName);

  const gradlePath = path.join(profile._outputDir, 'app', 'build.gradle');
  const aabPath = path.join(profile._outputDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
  const apkPath = path.join(profile._outputDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

  console.log('');
  log(`Verifying profile "${profile._name}"`);

  // 1. targetSdkVersion check
  if (fs.existsSync(gradlePath)) {
    const content = fs.readFileSync(gradlePath, 'utf8');
    const match = content.match(/targetSdk(?:Version)?\s*[=\s]\s*(\d+)/);
    if (match) {
      const sdk = Number(match[1]);
      if (sdk >= REQUIRED_MIN_TARGET_SDK) {
        ok(`targetSdkVersion ${sdk} meets current Play Store minimum (${REQUIRED_MIN_TARGET_SDK}).`);
      } else {
        fail(`targetSdkVersion ${sdk} is BELOW the required minimum (${REQUIRED_MIN_TARGET_SDK}). Run: npm run patch -- --profile ${profile._name}`);
      }
    } else {
      warn('Could not find targetSdkVersion in build.gradle — inspect manually.');
    }
  } else {
    warn(`build.gradle not found — project not yet scaffolded. Run: npm run build -- --profile ${profile._name}`);
  }

  // 2. R8/shrinkResources check (Play Console "memory and performance" finding)
  if (fs.existsSync(gradlePath)) {
    const content = fs.readFileSync(gradlePath, 'utf8');
    const hasMinify = /minifyEnabled\s+true/.test(content);
    const hasShrink = /shrinkResources\s+true/.test(content);
    if (hasMinify && hasShrink) {
      ok('R8 code shrinking (minifyEnabled) and resource shrinking (shrinkResources) are both enabled.');
    } else {
      warn(`R8 optimization incomplete (minifyEnabled=${hasMinify}, shrinkResources=${hasShrink}). Run: npm run patch -- --profile ${profile._name}`);
    }
  }

  // 3. Signature check
  if (args.apk) {
    const signer = apksignerCommand();
    if (!fs.existsSync(apkPath)) {
      warn(`No signed APK found at ${apkPath} yet — run the build first.`);
    } else if (!signer) {
      warn('apksigner not found — install Android SDK build-tools and set ANDROID_HOME (or add apksigner to PATH) to verify the APK.');
    } else {
      log('Checking APK signature with apksigner verify...');
      const [signerCmd, ...signerPre] = signer;
      const res = tryRun(signerCmd, [...signerPre, 'verify', '--verbose', apkPath]);
      if (res.status === 0) {
        ok('APK is signed and verifies correctly.');
      } else {
        warn('APK does not verify. Run: npm run build -- --profile ' + profile._name);
      }
    }
  } else if (fs.existsSync(aabPath)) {
    log('Checking AAB signature with jarsigner -verify...');
    const res = tryRun('jarsigner', ['-verify', '-verbose', aabPath]);
    if (res.status === 0) {
      ok('AAB is signed and verifies correctly.');
    } else {
      warn('AAB does not appear to be signed yet. Run: npm run sign -- --profile ' + profile._name);
    }
  } else {
    warn(`No AAB found at ${aabPath} yet — run the build first.`);
  }

  // 4. Digital Asset Links — actually fetch and check it live, since a
  // missing/mismatched assetlinks.json is the #1 cause of the app falling
  // back to a visible browser URL bar / toolbar instead of running fullscreen
  // with no default browser chrome at all.
  console.log('');
  log(`Fetching live https://${profile.host}/.well-known/assetlinks.json ...`);
  const assetLinksUrl = `https://${profile.host}/.well-known/assetlinks.json`;
  const res = await fetchJson(assetLinksUrl);

  let localFingerprint = null;
  if (fs.existsSync(profile._keystorePath)) {
    const ksPass = process.env.WEBTWA_KEYSTORE_PASSWORD;
    const ktArgs = ['-list', '-v', '-keystore', profile._keystorePath, '-alias', profile.signingKey.alias];
    if (ksPass) ktArgs.push('-storepass', ksPass);
    const ktRes = spawnSync('keytool', ktArgs, { encoding: 'utf8' });
    const match = ktRes.stdout && ktRes.stdout.match(/SHA256:\s*([0-9A-Fa-f:]+)/);
    if (match) localFingerprint = match[1];
  }

  if (!res || res.statusCode >= 400) {
    warn(`Could not fetch ${assetLinksUrl} (${res ? `HTTP ${res.statusCode}` : 'request failed'}).`);
    warn('Until this is live, served as application/json over HTTPS with no redirects, the app will show a browser URL bar instead of running fullscreen.');
  } else {
    const contentType = res.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      warn(`${assetLinksUrl} responded but Content-Type is "${contentType}", not application/json — some browsers will refuse to trust it, showing the default browser UI.`);
    }
    let parsed;
    try {
      parsed = JSON.parse(res.body);
    } catch (e) {
      warn(`${assetLinksUrl} did not return valid JSON — the app will show a browser URL bar instead of running fullscreen.`);
    }
    if (parsed) {
      const fingerprints = [];
      for (const entry of parsed) {
        const list = (entry.target && entry.target.sha256_cert_fingerprints) || [];
        fingerprints.push(...list);
      }
      const packageMatch = parsed.some((entry) => entry.target && entry.target.package_name === profile.packageId);
      if (!packageMatch) {
        warn(`${assetLinksUrl} does not list package_name "${profile.packageId}" — verification will fail and the app will show the browser URL bar.`);
      } else if (localFingerprint && !fingerprints.includes(localFingerprint)) {
        warn(`${assetLinksUrl} does not include this build's fingerprint (${localFingerprint}). If this AAB was uploaded through Play App Signing, that's expected — just confirm the Play App Signing fingerprint (see profile.playSigningFingerprint) is listed instead. Otherwise re-run: node scripts/gen-assetlinks.js --profile ${profile._name} --write`);
      } else {
        ok(`${assetLinksUrl} is live and lists a matching fingerprint for ${profile.packageId}. No default browser URL bar should appear.`);
      }
    }
  }
  console.log('');
}

main().catch((e) => {
  fail(e.message);
  process.exit(1);
});