#!/usr/bin/env node
'use strict';
/**
 * Validates that the profile's live website disables pinch/double-tap zoom.
 *
 * IMPORTANT ARCHITECTURE NOTE: a Bubblewrap TWA does not render the site in
 * our own code — with fallbackType "customtabs" (the default, and the only
 * mode Google recommends for the Play Store) the page is rendered by the
 * user's installed browser (Chrome) inside a Trusted Web Activity, exactly
 * like the browser renders any other page. Pinch-zoom, double-tap-zoom and
 * text-only zoom are controlled entirely by the page's own
 * <meta name="viewport"> tag — this is standard browser behavior and is not
 * something any Android/Java code in the wrapping app can override. The
 * android "webview" fallbackType is a legacy path used only on the small
 * number of devices without a TWA-capable browser installed; it renders
 * through android.webkit.WebView, which also honors the page's viewport tag.
 *
 * So the real, durable fix — the one that actually works once the app is
 * installed from Google Play — is on the website: the viewport tag must
 * disable scaling. This script checks that automatically before every
 * build so a missing/incorrect viewport tag is caught immediately instead
 * of discovered after Play Store review.
 *
 * Usage:
 *   node scripts/check-viewport.js --profile seeze
 *   node scripts/check-viewport.js --profile seeze --strict   (exit 1 on failure)
 */
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { parseArgs } = require('../lib/args');
const { loadProfile } = require('../lib/profile');
const { log, ok, warn, fail } = require('../lib/shell');

const REQUIRED_SNIPPET =
  '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">';

function fetchUrl(targetUrl, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'http:' ? http : https;
    const req = client.get(
      parsed,
      { headers: { 'User-Agent': 'webtwa-toolkit-viewport-check' }, timeout: 15000 },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
          res.resume();
          const next = new URL(res.headers.location, parsed);
          resolve(fetchUrl(next.toString(), redirectsLeft - 1));
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 2_000_000) req.destroy();
        });
        res.on('end', () => resolve({ statusCode: res.statusCode, body }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
  });
}

function extractViewportContent(html) {
  const match = html.match(/<meta[^>]+name=["']viewport["'][^>]*>/i);
  if (!match) return null;
  const contentMatch = match[0].match(/content=["']([^"']*)["']/i);
  return contentMatch ? contentMatch[1] : '';
}

function isZoomDisabled(viewportContent) {
  const parts = viewportContent.split(',').map((p) => p.trim().toLowerCase());
  const get = (key) => {
    const entry = parts.find((p) => p.startsWith(key + '='));
    return entry ? entry.split('=')[1].trim() : null;
  };
  const userScalable = get('user-scalable');
  const maximumScale = get('maximum-scale');
  const userScalableOff = userScalable === 'no' || userScalable === '0';
  const maxScaleLocked = maximumScale !== null && Number(maximumScale) <= 1;
  return userScalableOff || maxScaleLocked;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const profileName = args.profile || args._[0];
  const profile = loadProfile(profileName);

  const pageUrl = `https://${profile.host}${profile.startUrl && profile.startUrl !== '/' ? profile.startUrl : '/'}`;
  log(`Checking viewport/zoom settings on ${pageUrl} ...`);

  let html;
  try {
    const res = await fetchUrl(pageUrl);
    if (res.statusCode >= 400) {
      warn(`Fetched ${pageUrl} but got HTTP ${res.statusCode}. Skipping zoom check (not blocking build).`);
      return;
    }
    html = res.body;
  } catch (e) {
    warn(`Could not fetch ${pageUrl} to check the viewport tag (${e.message}). Skipping zoom check (not blocking build).`);
    return;
  }

  const viewportContent = extractViewportContent(html);

  if (viewportContent === null) {
    reportZoomable(profile, 'No <meta name="viewport"> tag was found on the page at all.');
  } else if (!isZoomDisabled(viewportContent)) {
    reportZoomable(profile, `Found <meta name="viewport" content="${viewportContent}">, but it does not disable scaling.`);
  } else {
    ok(`Zoom is disabled by the site's viewport tag (content="${viewportContent}"). Pinch/double-tap zoom will not work in the generated app.`);
  }

  function reportZoomable(_profile, reason) {
    const message =
      `${reason}\n` +
      '   Zoom in a Trusted Web Activity / WebView-rendered app is controlled ' +
      'entirely by the website\'s own viewport tag — it cannot be disabled from ' +
      'Android app code. Add this to the <head> of every page on ' +
      `${profile.host} to make the generated app non-zoomable:\n\n` +
      `      ${REQUIRED_SNIPPET}\n`;
    if (args.strict) {
      fail(message);
      process.exit(1);
    } else {
      warn(message);
    }
  }
}

main().catch((e) => {
  fail(e.message);
  process.exit(1);
});
