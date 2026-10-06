#!/usr/bin/env node
'use strict';
/**
 * Defensive patch (same idea as patch-gradle.js): after scaffold, Bubblewrap
 * already themes most of the generated project from the profile's
 * themeColor/navigationColor/backgroundColor (status bar, nav bar, splash
 * background, colorPrimary/colorAccent) because those are passed straight
 * into TwaManifest in scripts/init.js. Three spots are left on their default
 * (non-themed) values by the stock Bubblewrap template and are the most
 * common source of "default Android/browser look" complaints in a TWA:
 *
 *   1. The Android 12+ system splash screen (SplashScreen API) draws the
 *      launcher icon on a plain white circle unless
 *      windowSplashScreenIconBackgroundColor is explicitly set — this shows
 *      as a flash of default white before the themed splash/content appear.
 *   2. Notifications posted through the TWA notification delegation use the
 *      system default (grey/black) small-icon tint unless a notification
 *      color meta-data is present in AndroidManifest.xml.
 *   3. The base (pre-splash) window background defaults to plain system
 *      white/black unless android:windowBackground is set, which shows as a
 *      flash of default color between process start and the themed splash
 *      actually drawing.
 *
 * All three are patched here, idempotently and defensively: if the expected
 * template pattern isn't found (e.g. a Bubblewrap/androidbrowserhelper
 * version that already sets it, or changed its template), this script warns
 * instead of failing, exactly like patch-gradle.js does.
 *
 * Usage: node scripts/patch-theme.js --profile seeze
 */
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('../lib/args');
const { loadProfile } = require('../lib/profile');
const { log, ok, warn } = require('../lib/shell');

const args = parseArgs(process.argv.slice(2));

function ensureAppTheme(profile) {
  const mainDir = path.join(profile._outputDir, 'app', 'src', 'main');
  const bg = profile.backgroundColor || profile.themeColor;
  const theme = (extra) => `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <style name="AppTheme" parent="@android:style/Theme.Translucent.NoTitleBar">\n        <item name="android:windowBackground">${bg}</item>${extra}\n    </style>\n</resources>\n`;
  const v31 = `\n        <item name="android:windowSplashScreenBackground">${bg}</item>\n        <item name="android:windowSplashScreenIconBackgroundColor">${bg}</item>`;
  for (const [dir, extra] of [['values', ''], ['values-v31', v31]]) {
    const stylesPath = path.join(mainDir, 'res', dir, 'styles.xml');
    fs.mkdirSync(path.dirname(stylesPath), { recursive: true });
    fs.writeFileSync(stylesPath, theme(extra), 'utf8');
    ok(`Wrote ${stylesPath} → window/splash background ${bg} (removes the default white flash and Android 12+ splash icon circle).`);
  }
  const manifestPath = path.join(mainDir, 'AndroidManifest.xml');
  if (!fs.existsSync(manifestPath)) {
    warn(`AndroidManifest.xml not found at ${manifestPath} — set android:theme="@style/AppTheme" on <application> manually.`);
    return;
  }
  const content = fs.readFileSync(manifestPath, 'utf8');
  if (/android:theme="@style\/AppTheme"/.test(content)) {
    ok('AndroidManifest.xml already uses @style/AppTheme — leaving as-is.');
  } else if (/android:theme="@android:style\/Theme\.Translucent\.NoTitleBar"/.test(content)) {
    fs.writeFileSync(manifestPath, content.replace('android:theme="@android:style/Theme.Translucent.NoTitleBar"', 'android:theme="@style/AppTheme"'), 'utf8');
    ok(`Patched ${manifestPath} → application theme is now @style/AppTheme.`);
  } else {
    warn(`Unexpected android:theme in ${manifestPath} — set android:theme="@style/AppTheme" on <application> manually.`);
  }
}

function patchNotificationColor(profile) {
  if (profile.enableNotifications === false) {
    ok('Notifications disabled for this profile — skipping notification color patch.');
    return;
  }

  const manifestPath = path.join(profile._outputDir, 'app', 'src', 'main', 'AndroidManifest.xml');
  if (!fs.existsSync(manifestPath)) {
    warn(`AndroidManifest.xml not found at ${manifestPath} — skipping notification color patch.`);
    return;
  }

  let content = fs.readFileSync(manifestPath, 'utf8');
  const original = content;
  const themeColor = profile.themeColor;
  const metaTag = `        <meta-data\n            android:name="android.support.customtabs.trusted.NOTIFICATION_ACCENT_COLOR"\n            android:resource="@color/colorPrimary" />\n`;

  if (/NOTIFICATION_ACCENT_COLOR/.test(content)) {
    ok('AndroidManifest.xml already declares NOTIFICATION_ACCENT_COLOR — leaving as-is.');
  } else if (/(<meta-data\s+android:name="android\.support\.customtabs\.trusted\.DEFAULT_URL"[\s\S]*?\/>\n)/.test(content)) {
    content = content.replace(
      /(<meta-data\s+android:name="android\.support\.customtabs\.trusted\.DEFAULT_URL"[\s\S]*?\/>\n)/,
      `$1${metaTag}`
    );
  }

  if (content === original) {
    if (!/NOTIFICATION_ACCENT_COLOR/.test(content)) {
      warn(`Could not find the DEFAULT_URL meta-data anchor in ${manifestPath} — add NOTIFICATION_ACCENT_COLOR manually, pointed at colorPrimary (${themeColor}).`);
    }
  } else {
    fs.writeFileSync(manifestPath, content, 'utf8');
    ok(`Patched ${manifestPath} → notifications now use colorPrimary (${themeColor}) instead of the system default accent.`);
  }
}

const profileName = args.profile || args._[0];
const profile = loadProfile(profileName);
log(`Removing remaining default (non-themed) UI from profile "${profile._name}"`);
ensureAppTheme(profile);
patchNotificationColor(profile);