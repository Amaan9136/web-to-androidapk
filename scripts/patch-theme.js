#!/usr/bin/env node
'use strict';
/**
 * Defensive patch (same idea as patch-gradle.js): after scaffold, Bubblewrap
 * already themes most of the generated project from the profile's
 * themeColor/navigationColor/backgroundColor (status bar, nav bar, splash
 * background, colorPrimary/colorAccent) because those are passed straight
 * into TwaManifest in scripts/init.js. Four spots are left on their default
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
 *   4. The status bar / navigation bar icon (light vs dark content) contrast
 *      is left on its system default regardless of how dark or light the
 *      profile's theme/navigation color is, which can leave system icons
 *      unreadable against a themed bar instead of matching it.
 *
 * All four are patched here, idempotently and defensively: if the expected
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

function isLightColor(hex) {
  const clean = String(hex).replace('#', '');
  const rgb = clean.length === 8 ? clean.slice(2) : clean;
  const r = parseInt(rgb.slice(0, 2), 16);
  const g = parseInt(rgb.slice(2, 4), 16);
  const b = parseInt(rgb.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 149;
}

function patchWindowBackground(profile) {
  const stylesPath = path.join(profile._outputDir, 'app', 'src', 'main', 'res', 'values', 'styles.xml');
  if (!fs.existsSync(stylesPath)) {
    warn(`values/styles.xml not found at ${stylesPath} — skipping base window background patch (verify manually).`);
    return;
  }

  let content = fs.readFileSync(stylesPath, 'utf8');
  const original = content;
  const bgColor = profile.backgroundColor || profile.themeColor;

  if (/windowBackground/.test(content)) {
    content = content.replace(
      /(<item name="android:windowBackground">)[^<]*(<\/item>)/,
      `$1${bgColor}$2`
    );
  } else if (/<style name="AppTheme"[^>]*>/.test(content)) {
    content = content.replace(
      /(<style name="AppTheme"[^>]*>)/,
      `$1\n        <item name="android:windowBackground">${bgColor}</item>`
    );
  }

  if (content === original) {
    warn(`Could not locate an AppTheme block to patch in ${stylesPath} — verify android:windowBackground manually.`);
  } else {
    fs.writeFileSync(stylesPath, content, 'utf8');
    ok(`Patched ${stylesPath} → windowBackground ${bgColor} (removes the default system-color flash before the themed splash draws).`);
  }
}

function patchBarIconContrast(profile) {
  const statusBarColor = profile.themeColor;
  const navBarColor = profile.navigationColor || profile.themeColor;

  const targets = [
    { dir: 'values-v23', item: 'android:windowLightStatusBar', color: statusBarColor, label: 'status bar' },
    { dir: 'values-v27', item: 'android:windowLightNavigationBar', color: navBarColor, label: 'navigation bar' },
    { dir: 'values-v27', item: 'android:enforceNavigationBarContrast', color: navBarColor, label: 'navigation bar scrim', fixed: 'false' },
    { dir: 'values-v27', item: 'android:enforceStatusBarContrast', color: statusBarColor, label: 'status bar scrim', fixed: 'false' },
  ];

  for (const { dir, item, color, label, fixed } of targets) {
    const stylesPath = path.join(profile._outputDir, 'app', 'src', 'main', 'res', dir, 'styles.xml');
    if (!fs.existsSync(stylesPath)) {
      warn(`${dir}/styles.xml not found at ${stylesPath} — skipping ${label} icon contrast patch (verify manually).`);
      continue;
    }

    let content = fs.readFileSync(stylesPath, 'utf8');
    const original = content;
    const wantLightIcons = !isLightColor(color);
    const value = fixed || (wantLightIcons ? 'false' : 'true');

    if (new RegExp(item).test(content)) {
      content = content.replace(
        new RegExp(`(<item name="${item}">)[^<]*(<\\/item>)`),
        `$1${value}$2`
      );
    } else if (/<style name="AppTheme"[^>]*>/.test(content)) {
      content = content.replace(
        /(<style name="AppTheme"[^>]*>)/,
        `$1\n        <item name="${item}">${value}</item>`
      );
    }

    if (content === original) {
      warn(`Could not locate an AppTheme block to patch in ${stylesPath} — verify ${item} manually.`);
    } else {
      fs.writeFileSync(stylesPath, content, 'utf8');
      ok(`Patched ${stylesPath} → ${item}=${value} (${label} icons now contrast correctly against ${color} instead of the system default).`);
    }
  }
}

function patchSplashIconBackground(profile) {
  const stylesPath = path.join(profile._outputDir, 'app', 'src', 'main', 'res', 'values-v31', 'styles.xml');
  if (!fs.existsSync(stylesPath)) {
    warn(`values-v31/styles.xml not found at ${stylesPath} — skipping Android 12+ splash icon background patch (verify manually if targeting API 31+).`);
    return;
  }

  let content = fs.readFileSync(stylesPath, 'utf8');
  const original = content;
  const themeColor = profile.backgroundColor || profile.themeColor;

  if (/windowSplashScreenIconBackgroundColor/.test(content)) {
    content = content.replace(
      /(<item name="android:windowSplashScreenIconBackgroundColor">)[^<]*(<\/item>)/,
      `$1${themeColor}$2`
    );
  } else if (/<style name="AppTheme"[^>]*>/.test(content)) {
    content = content.replace(
      /(<style name="AppTheme"[^>]*>)/,
      `$1\n        <item name="android:windowSplashScreenIconBackgroundColor">${themeColor}</item>`
    );
  }

  if (content === original) {
    warn(`Could not locate an AppTheme block to patch in ${stylesPath} — verify windowSplashScreenIconBackgroundColor manually.`);
  } else {
    fs.writeFileSync(stylesPath, content, 'utf8');
    ok(`Patched ${stylesPath} → windowSplashScreenIconBackgroundColor ${themeColor} (removes the default white Android 12+ splash icon circle).`);
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
patchSplashIconBackground(profile);
patchNotificationColor(profile);
patchWindowBackground(profile);
patchBarIconContrast(profile);