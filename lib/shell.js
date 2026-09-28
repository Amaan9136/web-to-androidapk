'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(msg) { console.log(`${COLORS.cyan}[webtwa]${COLORS.reset} ${msg}`); }
function ok(msg) { console.log(`${COLORS.green}[ok]${COLORS.reset} ${msg}`); }
function warn(msg) { console.warn(`${COLORS.yellow}[warn]${COLORS.reset} ${msg}`); }
function fail(msg) {
  console.error(`${COLORS.red}${COLORS.bold}[error]${COLORS.reset} ${msg}`);
  process.exitCode = 1;
}

/**
 * Runs a command synchronously, streaming output, and throws on non-zero exit.
 */
function run(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status}): ${cmd} ${args.join(' ')}`);
  }
  return res;
}

/**
 * Like run(), but does not throw — returns { status, error } so callers
 * can decide how to handle failure (used for optional/best-effort steps).
 */
function tryRun(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(' ')}`);
  const res = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  return res;
}

function apksignerCommand() {
  if (process.platform !== 'win32') {
    const onPath = spawnSync('apksigner', ['--version']);
    if (!onPath.error && onPath.status === 0) return ['apksigner'];
  }
  const roots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, path.join(os.homedir(), '.bubblewrap', 'android_sdk')].filter(Boolean);
  for (const root of roots) {
    const dir = path.join(root, 'build-tools');
    if (!fs.existsSync(dir)) continue;
    const versions = fs.readdirSync(dir).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const v of versions) {
      const jar = path.join(dir, v, 'lib', 'apksigner.jar');
      if (fs.existsSync(jar)) return ['java', '-jar', jar];
    }
  }
  return null;
}

module.exports = { log, ok, warn, fail, run, tryRun, apksignerCommand, COLORS };