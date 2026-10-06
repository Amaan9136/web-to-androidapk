#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { parseArgs } = require('../lib/args');
const { loadProfile } = require('../lib/profile');
const { log, ok, warn } = require('../lib/shell');

const args = parseArgs(process.argv.slice(2));
const profile = loadProfile(args.profile || args._[0]);
const webDir = path.join(profile._outputDir, 'web');
fs.mkdirSync(webDir, { recursive: true });

const config = {
  mobileOnly: profile.mobileOnly,
  viewport: profile.viewport,
  pullToRefresh: profile.pullToRefresh,
  progressBar: profile.progressBar,
  ui: profile.ui,
  colors: { accent: profile.themeColor.slice(0, 7), accentDark: (profile.themeColorDark || profile.themeColor).slice(0, 7) },
};
const clientJs = `window.__TWA_CONFIG__=${JSON.stringify(config)};\n` + fs.readFileSync(path.join(__dirname, '..', 'lib', 'twa-client.js'), 'utf8');
fs.writeFileSync(path.join(webDir, 'twa-mobile.js'), clientJs, 'utf8');

const snippet = [
  `<meta name="viewport" content="${profile.viewport}">`,
  `<meta name="theme-color" content="${profile.themeColor}">`,
  '<meta name="mobile-web-app-capable" content="yes">',
  '<script src="/twa-mobile.js"></script>',
].join('\n') + '\n';
fs.writeFileSync(path.join(webDir, 'head-snippet.html'), snippet, 'utf8');

const display = profile.display.replace('-sticky', '');
const manifestPatch = {
  display,
  display_override: [display],
  orientation: profile.orientation === 'default' ? 'any' : profile.orientation,
  theme_color: profile.themeColor,
  background_color: profile.backgroundColor,
  start_url: profile.startUrl,
  scope: '/',
};
fs.writeFileSync(path.join(webDir, 'manifest-patch.json'), JSON.stringify(manifestPatch, null, 2) + '\n', 'utf8');

ok(`Web assets written to ${webDir}`);

if (profile.webRoot) {
  const root = path.resolve(path.join(__dirname, '..'), profile.webRoot);
  if (!fs.existsSync(root)) {
    warn(`webRoot ${root} does not exist — skipping automatic site sync. Fix "webRoot" in profiles/${profile._name}.json or copy ${webDir} by hand.`);
  } else {
    fs.writeFileSync(path.join(root, 'twa-mobile.js'), clientJs, 'utf8');
    ok(`Wrote ${path.join(root, 'twa-mobile.js')}`);
    const manifestPath = profile.webManifestPath
      ? path.resolve(root, profile.webManifestPath)
      : ['manifest.json', 'manifest.webmanifest'].map((f) => path.join(root, f)).find((f) => fs.existsSync(f));
    if (manifestPath && fs.existsSync(manifestPath)) {
      try {
        fs.writeFileSync(manifestPath, JSON.stringify({ ...JSON.parse(fs.readFileSync(manifestPath, 'utf8')), ...manifestPatch }, null, 2) + '\n', 'utf8');
        ok(`Merged manifest-patch.json into ${manifestPath}`);
      } catch (e) {
        warn(`Could not merge into ${manifestPath} (${e.message}) — merge ${path.join(webDir, 'manifest-patch.json')} by hand.`);
      }
    } else {
      warn(`No manifest.json / manifest.webmanifest found under ${root} — set "webManifestPath" in the profile or merge manifest-patch.json by hand.`);
    }
    profile.webHtml.forEach((f) => {
      const htmlPath = path.resolve(root, f);
      if (!fs.existsSync(htmlPath)) return warn(`${htmlPath} not found — paste head-snippet.html first inside <head> by hand.`);
      let html = fs.readFileSync(htmlPath, 'utf8')
        .replace(/<!-- twa:start -->[\s\S]*?<!-- twa:end -->\s*/g, '')
        .replace(/<meta[^>]+name=["']viewport["'][^>]*>\s*/gi, '');
      if (!/<head[^>]*>/i.test(html)) return warn(`${htmlPath} has no <head> tag — paste head-snippet.html into your layout/template by hand.`);
      html = html.replace(/<head[^>]*>/i, (m) => `${m}\n<!-- twa:start -->\n${snippet}<!-- twa:end -->`);
      fs.writeFileSync(htmlPath, html, 'utf8');
      ok(`Injected head snippet into ${htmlPath}`);
    });
    log('Site files updated locally — deploy your site so https://' + profile.host + '/twa-mobile.js is live before publishing the app.');
  }
} else {
  log(`Host twa-mobile.js at https://${profile.host}/twa-mobile.js, paste head-snippet.html first inside <head> on every page, then merge manifest-patch.json into ${profile.webManifestUrl} — or set "webRoot" in the profile and this step does all three for you.`);
}
