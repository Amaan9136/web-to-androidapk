#!/usr/bin/env node
'use strict';
/**
 * Initializes a new TWA project for a profile using Bubblewrap's
 * programmatic core API (not just shelling out to the CLI), so we get
 * proper error handling and can inject our own defaults (icons, colors,
 * signing key path) straight from the profile JSON.
 *
 * Usage: node scripts/init.js --profile seeze
 */
const path = require('path');
const fs = require('fs');
const { parseArgs } = require('../lib/args');
const { loadProfile } = require('../lib/profile');
const { log, ok, warn, fail, run } = require('../lib/shell');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profileName = args.profile || args._[0];
  const profile = loadProfile(profileName);

  fs.mkdirSync(profile._outputDir, { recursive: true });

  log(`Initializing TWA project for profile "${profile._name}" (${profile.packageId})`);
  log(`Output directory: ${profile._outputDir}`);

  // We drive the real @bubblewrap/core TwaManifest + TwaGenerator API directly,
  // rather than the interactive CLI, so this step is fully scriptable/CI-safe.
  const core = require('@bubblewrap/core');
  const { TwaManifest, TwaGenerator, ConsoleLog } = core;

  const twaLog = new ConsoleLog('webtwa');

  // Build a TwaManifest directly from the profile — equivalent to what
  // `bubblewrap init --manifest <url>` produces, but fully non-interactive.
  const manifest = new TwaManifest({
    packageId: profile.packageId,
    host: profile.host,
    name: profile.name,
    launcherName: profile.launcherName,
    display: profile.display,
    orientation: profile.orientation,
    themeColor: profile.themeColor,
    themeColorDark: profile.themeColorDark || profile.themeColor,
    navigationColor: profile.navigationColor || profile.themeColor,
    navigationColorDark: profile.navigationColorDark || profile.navigationColor || profile.themeColor,
    backgroundColor: profile.backgroundColor,
    startUrl: profile.startUrl,
    iconUrl: profile.iconUrl,
    maskableIconUrl: profile.maskableIconUrl || profile.iconUrl,
    monochromeIconUrl: profile.monochromeIconUrl,
    shortcuts: profile.shortcuts || [],
    appVersion: String(profile.appVersionName), // NOTE: TwaManifest's constructor reads appVersionName from `data.appVersion`, not `data.appVersionName`.
    appVersionCode: Number(profile.appVersionCode),
    minSdkVersion: Number(profile.minSdkVersion),
    splashScreenFadeOutDuration: Number(profile.splashScreenFadeOutDuration) || 300,
    signingKey: {
      path: profile._keystorePath,
      alias: profile.signingKey.alias,
    },
    isChromeOSOnly: false,
    isMetaQuest: false,
    fallbackType: profile.fallbackType || 'customtabs',
    features: profile.features || {},
    alphaDependencies: { enabled: false },
    enableNotifications: profile.enableNotifications !== false,
    enableSiteSettingsShortcut: profile.enableSiteSettingsShortcut !== false,
    additionalTrustedOrigins: profile.additionalTrustedOrigins || [],
    generatorApp: 'webtwa-toolkit',
    webManifestUrl: profile.webManifestUrl,
  });

  const twaGenerator = new TwaGenerator();
  await twaGenerator.createTwaProject(profile._outputDir, manifest, twaLog);

  fs.writeFileSync(path.join(profile._outputDir, '.profile-hash'), profile._hash);
  ok(`Project scaffolded at ${profile._outputDir}`);
  log('Next: npm run build -- --profile ' + profile._name);
}

main().catch((e) => {
  fail(e.message);
  console.error(e);
  process.exit(1);
});