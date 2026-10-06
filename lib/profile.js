'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PROFILES_DIR = path.join(__dirname, '..', 'profiles');

/**
 * Loads a profile JSON file by name (without .json extension) from /profiles.
 * Every field is validated so mistakes fail loudly instead of producing a
 * broken Android project 20 minutes into a build.
 */
function loadProfile(profileName) {
  if (!profileName) {
    throw new Error(
      'No profile specified. Usage: npm run build -- --profile <name>\n' +
      'Available profiles: ' + listProfiles().join(', ')
    );
  }
  const filePath = path.join(PROFILES_DIR, `${profileName}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Profile "${profileName}" not found at ${filePath}\n` +
      'Available profiles: ' + listProfiles().join(', ')
    );
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  let profile;
  try {
    profile = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Profile "${profileName}" is not valid JSON: ${e.message}`);
  }

  const required = [
    'packageId', 'host', 'name', 'launcherName', 'webManifestUrl',
    'startUrl', 'iconUrl', 'themeColor', 'backgroundColor',
    'signingKey', 'appVersionName', 'appVersionCode', 'minSdkVersion',
  ];
  const missing = required.filter((k) => profile[k] === undefined || profile[k] === null || profile[k] === '');
  if (missing.length) {
    throw new Error(`Profile "${profileName}" is missing required fields: ${missing.join(', ')}`);
  }

  if (!/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/.test(profile.packageId)) {
    throw new Error(
      `Profile "${profileName}": packageId "${profile.packageId}" doesn't look like a valid ` +
      'Android application ID (expected reverse-domain form, e.g. com.example.app.twa)'
    );
  }

  if (!profile.signingKey || !profile.signingKey.path || !profile.signingKey.alias) {
    throw new Error(
      `Profile "${profileName}": signingKey must include { "path": "...", "alias": "..." }`
    );
  }

  const hexRe = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
  const badColors = ['themeColor', 'navigationColor', 'backgroundColor', 'themeColorDark', 'navigationColorDark'].filter((k) => profile[k] && !hexRe.test(profile[k]));
  if (badColors.length) {
    throw new Error(`Profile "${profileName}": invalid color in ${badColors.join(', ')} (expected #RRGGBB or #AARRGGBB)`);
  }

  const enums = {
    display: ['standalone', 'fullscreen', 'fullscreen-sticky', 'minimal-ui'],
    orientation: ['default', 'portrait', 'landscape'],
    fallbackType: ['customtabs', 'webview'],
  };
  for (const [key, allowed] of Object.entries(enums)) {
    if (profile[key] && !allowed.includes(profile[key])) {
      throw new Error(`Profile "${profileName}": ${key} "${profile[key]}" must be one of: ${allowed.join(', ')}`);
    }
  }

  const badNested = [['pullToRefresh', ['background', 'backgroundDark', 'border', 'borderDark', 'ring', 'ringDark', 'accent', 'accentDark']], ['progressBar', ['color', 'colorDark']]]
    .flatMap(([o, ks]) => ks.filter((k) => profile[o] && profile[o][k] && !/^#[0-9a-fA-F]{6}$/.test(profile[o][k])).map((k) => `${o}.${k}`));
  if (badNested.length) {
    throw new Error(`Profile "${profileName}": invalid color in ${badNested.join(', ')} (expected #RRGGBB)`);
  }

  const { playSigningFingerprint, _playSigningFingerprint_comment, _comment, _webRoot_comment, mobileOnly, viewport, pullToRefresh, progressBar, ui, webRoot, webHtml, webManifestPath, ...buildFields } = profile;
  profile._hash = crypto.createHash('sha1').update(JSON.stringify(buildFields)).digest('hex');

  profile.display = profile.display || 'standalone';
  profile.orientation = profile.orientation || 'default';
  profile.mobileOnly = mobileOnly !== false;
  const vp = (viewport || 'width=device-width').split(',').map((s) => s.trim()).filter((s) => s && !/^(initial-scale|minimum-scale|maximum-scale|user-scalable|viewport-fit)\s*=/i.test(s));
  if (!vp.some((s) => /^width\s*=/i.test(s))) vp.unshift('width=device-width');
  profile.viewport = vp.concat(['initial-scale=1', 'minimum-scale=1', 'maximum-scale=1', 'user-scalable=no', 'viewport-fit=cover']).join(', ');
  const ptr = pullToRefresh || {};
  const themeDark = profile.themeColorDark || profile.themeColor;
  profile.pullToRefresh = {
    enabled: ptr.enabled === undefined ? 'auto' : ptr.enabled,
    threshold: ptr.threshold || 70,
    background: ptr.background || profile.themeColor,
    backgroundDark: ptr.backgroundDark || ptr.background || themeDark,
    border: ptr.border || ptr.accent || profile.themeColor,
    borderDark: ptr.borderDark || ptr.accentDark || ptr.border || themeDark,
    ring: ptr.ring || '',
    ringDark: ptr.ringDark || ptr.ring || '',
  };
  profile.progressBar = {
    enabled: true,
    height: 3,
    color: profile.themeColor,
    colorDark: themeDark,
    ...progressBar,
  };
  profile.ui = {
    nativeTheme: true,
    safeArea: 'auto',
    lockContextMenu: true,
    lockSelection: false,
    ...ui,
  };
  profile.webRoot = webRoot || '';
  profile.webHtml = webHtml || [];
  profile.webManifestPath = webManifestPath || '';

  profile._name = profileName;
  profile._keystorePath = path.resolve(path.join(PROFILES_DIR, '..'), profile.signingKey.path);
  profile._outputDir = path.join(PROFILES_DIR, '..', 'output', profileName);
  return profile;
}

function listProfiles() {
  if (!fs.existsSync(PROFILES_DIR)) return [];
  return fs.readdirSync(PROFILES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
}

module.exports = { loadProfile, listProfiles, PROFILES_DIR };