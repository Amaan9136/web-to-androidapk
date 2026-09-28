#!/usr/bin/env node
'use strict';
/**
 * Handles keystore generation and manual signing.
 *
 * NOTE: Gradle produces the AAB and APK unsigned. `npm run build` signs the
 * APK automatically and saves it as app-release.apk, replacing
 * app-release-unsigned.apk. The AAB is signed with this script. This script
 * covers the two cases where you need manual control:
 *
 *   1. You don't have a keystore yet:
 *        npm run sign -- --profile seeze --generate-key
 *
 *   2. You already have an AAB/APK built unsigned and want to sign it
 *      directly with jarsigner/apksigner:
 *        npm run sign -- --profile seeze --file path/to/app-release.aab
 *
 * Passwords are read from environment variables so they never need to be
 * typed into shell history or committed to disk:
 *   WEBTWA_KEYSTORE_PASSWORD
 *   WEBTWA_KEY_PASSWORD
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { parseArgs } = require('../lib/args');
const { loadProfile } = require('../lib/profile');
const { log, ok, warn, fail, run, apksignerCommand } = require('../lib/shell');

function prompt(question, hidden = false) {
  return new Promise((resolve) => {
    if (!hidden) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    // Cross-platform masked input. The previous readline._writeToOutput hack
    // did not reliably suppress terminal echo on Windows terminals, which
    // could result in typed/pasted text (including other commands) being
    // captured verbatim as the password. This implementation reads raw
    // keystrokes directly and never echoes them, matching what sudo/ssh do.
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    let input = '';

    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const onData = (char) => {
      char = char.toString();
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004': // Ctrl-D
          stdin.removeListener('data', onData);
          if (stdin.isTTY) stdin.setRawMode(wasRaw);
          stdin.pause();
          process.stdout.write('\n');
          resolve(input);
          break;
        case '\u0003': // Ctrl-C
          process.stdout.write('\n');
          process.exit(1);
          break;
        case '\u007f': // Backspace
        case '\b':
          input = input.slice(0, -1);
          break;
        default:
          input += char;
          break;
      }
    };
    stdin.on('data', onData);
  });
}

async function getPasswords() {
  let ksPass = process.env.WEBTWA_KEYSTORE_PASSWORD;
  let keyPass = process.env.WEBTWA_KEY_PASSWORD;
  if (!ksPass) ksPass = await prompt('Keystore password: ', true);
  if (!keyPass) keyPass = await prompt('Key password (enter to reuse keystore password): ', true) || ksPass;

  // Guard against the exact failure mode seen in practice: a shell command
  // or npm invocation getting captured as literal password text because
  // input wasn't actually masked/isolated. A real password won't contain
  // whitespace-separated command-like tokens this long.
  const looksLikeCommand = (s) => /\bnpm\b|\brun\b|--profile|\s{2,}/.test(s);
  if (looksLikeCommand(ksPass) || looksLikeCommand(keyPass)) {
    throw new Error(
      'The password just captured looks like a command, not a password ' +
      '(e.g. "npm run build -- --profile seeze"). This usually means input ' +
      'wasn\'t captured correctly in your terminal. Re-run this command and ' +
      'type only the password when prompted, or avoid prompts entirely by ' +
      'setting WEBTWA_KEYSTORE_PASSWORD and WEBTWA_KEY_PASSWORD as ' +
      'environment variables first.'
    );
  }
  if (!ksPass || ksPass.length < 6) {
    throw new Error('Keystore password is empty or too short — refusing to continue.');
  }
  return { ksPass, keyPass };
}

async function generateKey(profile) {
  if (fs.existsSync(profile._keystorePath)) {
    fail(`Keystore already exists at ${profile._keystorePath}. Refusing to overwrite — move or delete it first if you really want a new one.`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(profile._keystorePath), { recursive: true });

  const { ksPass, keyPass } = await getPasswords();
  const dn = profile.signingKey.dn ||
    `CN=${profile.name}, OU=Engineering, O=${profile.name}, L=Unknown, S=Unknown, C=US`;

  run('keytool', [
    '-genkeypair',
    '-v',
    '-keystore', profile._keystorePath,
    '-alias', profile.signingKey.alias,
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', '10000',
    '-storepass', ksPass,
    '-keypass', keyPass,
    '-dname', dn,
  ]);

  ok(`Keystore created at ${profile._keystorePath}`);
  warn('BACK THIS FILE UP. If you lose it, you can never publish an update to this app again under the same package.');
  log('Print its SHA-256 fingerprint (needed for Digital Asset Links / assetlinks.json) with:');
  console.log(`   keytool -list -v -keystore "${profile._keystorePath}" -alias "${profile.signingKey.alias}"`);
}

async function signFile(profile, filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`File not found: ${filePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(profile._keystorePath)) {
    fail(`Keystore not found at ${profile._keystorePath}. Generate one first with --generate-key.`);
    process.exit(1);
  }
  const { ksPass, keyPass } = await getPasswords();

  if (filePath.endsWith('.aab')) {
    // AABs are signed with jarsigner (same as JAR signing).
    run('jarsigner', [
      '-verbose',
      '-sigalg', 'SHA256withRSA',
      '-digestalg', 'SHA-256',
      '-keystore', profile._keystorePath,
      '-storepass', ksPass,
      '-keypass', keyPass,
      filePath,
      profile.signingKey.alias,
    ]);
    ok(`Signed AAB: ${filePath}`);
    log('Upload this .aab directly to Google Play Console.');
  } else if (filePath.endsWith('.apk')) {
    const signer = apksignerCommand();
    if (!signer) {
      fail('apksigner not found. Install Android SDK build-tools (sdkmanager "build-tools;36.0.0") and set ANDROID_HOME, or add apksigner to PATH.');
      process.exit(1);
    }
    const outPath = filePath.replace(/-unsigned\.apk$/, '.apk');
    const [signerCmd, ...signerPre] = signer;
    run(signerCmd, [
      ...signerPre,
      'sign',
      '--ks', profile._keystorePath,
      '--ks-key-alias', profile.signingKey.alias,
      '--ks-pass', `pass:${ksPass}`,
      '--key-pass', `pass:${keyPass}`,
      ...(outPath !== filePath ? ['--out', outPath] : []),
      filePath,
    ]);
    if (outPath !== filePath) fs.rmSync(filePath);
    ok(`Signed APK: ${outPath}`);
    log('Install this .apk directly on an Android device, or share it for sideloading.');
  } else {
    fail('Unsupported file type — expected a .aab or .apk file.');
    process.exit(1);
  }
}

async function importExisting(profile, sourcePath) {
  if (!fs.existsSync(sourcePath)) {
    fail(`Source keystore not found: ${sourcePath}`);
    process.exit(1);
  }
  if (fs.existsSync(profile._keystorePath)) {
    fail(`A keystore already exists at ${profile._keystorePath}. Refusing to overwrite — move or delete it first if you really want to replace it.`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(profile._keystorePath), { recursive: true });
  fs.copyFileSync(sourcePath, profile._keystorePath);
  ok(`Copied ${sourcePath} → ${profile._keystorePath}`);

  // Verify it's readable and the alias matches the profile before declaring success.
  const ksPass = process.env.WEBTWA_KEYSTORE_PASSWORD;
  const checkArgs = ['-list', '-keystore', profile._keystorePath, '-alias', profile.signingKey.alias];
  if (ksPass) checkArgs.push('-storepass', ksPass);
  const res = require('child_process').spawnSync('keytool', checkArgs, { encoding: 'utf8' });
  if (res.status !== 0) {
    warn(`Could not verify alias "${profile.signingKey.alias}" in the imported keystore.`);
    warn('If your keystore uses a different alias (e.g. "my-key-alias" from a PWABuilder export),');
    warn(`update "signingKey.alias" in profiles/${profile._name}.json to match it exactly.`);
    console.error(res.stdout || res.stderr || '');
  } else {
    ok(`Verified alias "${profile.signingKey.alias}" exists in the imported keystore.`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profileName = args.profile || args._[0];
  const profile = loadProfile(profileName);

  if (args['generate-key']) {
    await generateKey(profile);
    return;
  }

  if (args['import-existing']) {
    const sourcePath = typeof args['import-existing'] === 'string' ? args['import-existing'] : null;
    if (!sourcePath) {
      fail('Usage: npm run sign -- --profile <name> --import-existing "C:\\path\\to\\signing.keystore"');
      process.exit(1);
    }
    await importExisting(profile, sourcePath);
    return;
  }

  const target = args.file || path.join(profile._outputDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
  await signFile(profile, target);
}

main().catch((e) => {
  fail(e.message);
  process.exit(1);
});