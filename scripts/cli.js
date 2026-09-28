#!/usr/bin/env node
'use strict';
/**
 * Unified entrypoint: `npx webtwa <command> --profile <name> [...flags]`
 * Thin dispatcher over the individual scripts so this project can also be
 * installed globally/linked and used as a general CLI for any future site.
 */
const path = require('path');
const { spawnSync } = require('child_process');

const COMMANDS = {
  init: 'init.js',
  build: 'build.js',
  patch: 'patch-gradle.js',
  'patch-theme': 'patch-theme.js',
  'check-viewport': 'check-viewport.js',
  sign: 'sign.js',
  verify: 'verify.js',
  'list-profiles': 'list-profiles.js',
  'assetlinks': 'gen-assetlinks.js',
  doctor: 'doctor.js',
};

const [, , cmd, ...rest] = process.argv;

if (!cmd || !COMMANDS[cmd]) {
  console.log(`webtwa — general Web-to-Android PWA (TWA) toolkit

Usage:
  webtwa <command> [--profile <name>] [flags]

Commands:
  doctor              Check your environment (Node/Java/keytool)
  list-profiles       List all configured site profiles
  init                Scaffold a new Android TWA project from a profile
  build               Full build: scaffold + patch + gradle -> AAB + signed APK
  patch               Force targetSdkVersion patch on an existing project
  patch-theme         Force-patch remaining default (non-themed) Android UI
  check-viewport      Check the live site disables pinch-zoom (no-code fix)
  sign                Generate a keystore or sign an existing AAB/APK
  verify              Check signing (--apk for the APK) + SDK compliance + asset links
  assetlinks          Print the assetlinks.json content for a profile

Examples:
  webtwa doctor
  webtwa build --profile seeze
  webtwa sign --profile seeze --generate-key
  webtwa verify --profile seeze
`);
  process.exit(cmd ? 1 : 0);
}

const scriptPath = path.join(__dirname, COMMANDS[cmd]);
const res = spawnSync(process.execPath, [scriptPath, ...rest], { stdio: 'inherit' });
process.exit(res.status ?? 1);