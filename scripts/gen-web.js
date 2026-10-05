#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('../lib/args');
const { loadProfile } = require('../lib/profile');
const { log, ok } = require('../lib/shell');

const args = parseArgs(process.argv.slice(2));
const profile = loadProfile(args.profile || args._[0]);
const webDir = path.join(profile._outputDir, 'web');
fs.mkdirSync(webDir, { recursive: true });

const config = { mobileOnly: profile.mobileOnly, viewport: profile.viewport, pullToRefresh: profile.pullToRefresh };
fs.writeFileSync(
  path.join(webDir, 'twa-mobile.js'),
  `window.__TWA_CONFIG__=${JSON.stringify(config)};\n` + fs.readFileSync(path.join(__dirname, '..', 'lib', 'twa-client.js'), 'utf8'),
  'utf8'
);

fs.writeFileSync(
  path.join(webDir, 'head-snippet.html'),
  [
    `<meta name="viewport" content="${profile.viewport}">`,
    `<meta name="theme-color" content="${profile.themeColor}">`,
    '<meta name="mobile-web-app-capable" content="yes">',
    '<script src="/twa-mobile.js"></script>',
  ].join('\n') + '\n',
  'utf8'
);

const display = profile.display.replace('-sticky', '');
fs.writeFileSync(
  path.join(webDir, 'manifest-patch.json'),
  JSON.stringify({
    display,
    display_override: [display],
    orientation: profile.orientation === 'default' ? 'any' : profile.orientation,
    theme_color: profile.themeColor,
    background_color: profile.backgroundColor,
    start_url: profile.startUrl,
    scope: '/',
  }, null, 2) + '\n',
  'utf8'
);

ok(`Web assets written to ${webDir}`);
log(`Host twa-mobile.js at https://${profile.host}/twa-mobile.js, paste head-snippet.html first inside <head> on every page, then merge manifest-patch.json into ${profile.webManifestUrl}`);
