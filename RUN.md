# RUN.md — webtwa: Web-to-Android PWA Toolkit

Everything you need to turn **any** website's PWA into a signed Android App
Bundle (`.aab`) for Google Play and a signed `.apk` for direct download and
sideloading — built on Google's real open-source
**Bubblewrap** library (`@bubblewrap/core` / `@bubblewrap/cli`, MIT/Apache-2.0
licensed, pulled straight from npm), with a compliance patch, multi-site
profile system, and a one‑command build/sign/verify pipeline.

💡 **Need AI guidance?** If you’re not sure where to start, check the **[PROMPT.md](./PROMPT.md)** file. It contains a ready‑to‑paste prompt you can feed to any LLM (Claude, ChatGPT, etc.) to get step‑by‑step assistance.

This is **not** a wrapper around pwabuilder.com — it drives Bubblewrap's
programmatic API directly, so it's scriptable, reusable across every site you
own, and doesn't depend on any third‑party website staying online.

All examples below use a placeholder profile name, `myapp`. Replace it with
whatever you name your own profile file (e.g. `--profile mystore` for
`profiles/mystore.json`).

---

## 0. Prerequisites

| Tool | Why | Install |
|---|---|---|
| **Node.js ≥ 18** | Runs this toolkit | https://nodejs.org |
| **JDK 17+** | Needed for `keytool`, `jarsigner`, Gradle | https://adoptium.net (or let Bubblewrap auto-install one on first run) |
| **Android SDK build-tools** (optional but recommended) | Needed for `apksigner` (proper v2/v3 APK signing) | Comes with Android Studio, or `sdkmanager "build-tools;36.0.0"` |

Check what you already have:

```bash
npm run doctor
```

---

## 1. Install

```bash
git clone https://github.com/Amaan9136/web-to-androidapk.git
cd web-to-androidapk
npm install
```

This pulls the real `@bubblewrap/core` and `@bubblewrap/cli` packages from
npm (currently `1.25.0`, published with the `targetSdkVersion 36` already baked
into its template — verified directly against the published package, not
just the GitHub source tree).

---

## 2. Configure a profile (one JSON file per website)

Every site you want to package lives as one JSON file in `/profiles`. A
template is included at `profiles/example.json`. To set up your own site:

```bash
cp profiles/example.json profiles/myapp.json
```

Edit the fields — see [Profile field reference](#profile-field-reference)
below. At minimum, update:

- `packageId` — reverse-domain Android app ID, e.g. `com.myapp.twa`
- `host` — your bare domain, e.g. `myapp.com`
- `webManifestUrl` — full URL to your `manifest.json`
- `iconUrl` / `maskableIconUrl` — must be ≥512×512 PNGs, publicly reachable
- `themeColor` / `backgroundColor`
- `signingKey.path` / `signingKey.alias`

List all configured profiles at any time:

```bash
npm run list-profiles
```

---

## 3. Set up your signing keystore

You have **two options** — pick based on whether this is a brand new app or
an update to one already on Google Play.

### Option A — You already have a keystore

If this app is already live on Google Play (for example, you previously
exported a package from PWABuilder with a real `signing.keystore`), **reuse
it** — Google Play requires every update to an app to be signed with the
*same* key as the original upload, so generating a new one now would make you
unable to update the app later (or would force you to publish under a brand
new package ID).

First, update `profiles/myapp.json`'s `signingKey` block to match your
existing key:

```jsonc
"signingKey": {
  "path": "keystores/myapp.jks",
  "alias": "my-key-alias",   // <-- from your signing-key-info.txt, not the profile name
  "dn": "CN=My App Admin, OU=Engineering, O=My Company, L=City, S=State, C=US"
}
```

Then import the real file into this project:

```bash
node scripts/sign.js --profile myapp --import-existing "/path/to/your/signing.keystore"
```

This copies it to `keystores/myapp.jks` and verifies the alias matches your
profile.

> ⚠️ **Never write real passwords into this file, a commit, or any tracked
> document.** Keep them only in your local `.env` (already gitignored) or
> your password manager. The placeholders below are examples — substitute
> your real values only when typing them locally, never when editing files
> that get committed.

Set them as environment variables so you're never typing them into a prompt
(this also avoids the Windows terminal issue below):

**PowerShell:**
```powershell
$env:WEBTWA_KEYSTORE_PASSWORD = "<your-keystore-password>"
$env:WEBTWA_KEY_PASSWORD = "<your-key-password>"
```

**cmd.exe:**
```cmd
set WEBTWA_KEYSTORE_PASSWORD=<your-keystore-password>
set WEBTWA_KEY_PASSWORD=<your-key-password>
```

Or, better: copy `.env.example` to `.env`, fill in the real values there
(it's already gitignored), and load it before running commands — that way
the password never appears in your shell history or in any file you might
accidentally `git add`.

### Option B — Brand new app, no existing keystore

```bash
npm run sign -- --profile myapp --generate-key
```

You'll be prompted for a keystore password and key password. **Type only the
password** — nothing else — when prompted; do not paste multi-word text or
another command into the prompt. Prefer setting the env vars above instead
of typing at the prompt at all, since that path is more reliable across
terminals.

> ⚠️ If a prompt ever accepts something that clearly isn't a real password
> (e.g. it contains spaces or looks like a command), the script will now
> refuse it and tell you to redo it — this used to fail silently.

> ⚠️ **Back up whichever keystore file you end up using somewhere durable.**
> If you lose it, you can never publish an update to that package ID again. 

---

## 4. Build

Full pipeline — scaffolds the Android project (if not already generated),
defensively patches `targetSdkVersion` to 36, runs the Gradle release build,
and signs the APK with your keystore:

```bash
npm run build -- --profile myapp
```

Useful flags:

```bash
# Scaffold + patch only, skip the (slow) Gradle build
npm run build -- --profile myapp --skip-build
```

First run downloads Gradle + Android build tools (~1GB) — this can take
several minutes depending on your connection.

Output lands at:

```
output/myapp/app/build/outputs/bundle/release/app-release.aab
output/myapp/app/build/outputs/apk/release/app-release.apk
```

The `.apk` is signed with your keystore and ready to share for testing or to
install as an unofficial (sideloaded) app. If no keystore exists yet, the
build leaves `app-release-unsigned.apk` instead; create a keystore and sign it
with `npm run sign -- --profile myapp --file <path-to-unsigned-apk>`.

---

## 4b. No default browser/Android UI: zoom, colors, progress

Every profile now gets this automatically as part of `npm run build`, with
nothing extra to configure:

- **Colors/theme** — `themeColor`, `navigationColor` and `backgroundColor`
  from the profile already drive the status bar, navigation bar, splash
  background and `colorPrimary`/`colorAccent` via Bubblewrap's own
  `TwaManifest` (see `scripts/init.js`). `npm run patch-theme` (run
  automatically during `npm run build`, right after `npm run patch`) closes
  the two gaps Bubblewrap's stock template leaves on default colors:
  the Android 12+ system splash screen's icon background circle, and the
  notification accent color — both are forced to the profile's theme color
  instead of the system default.
- **"Default browser" toolbar/progress bar** — a TWA only shows *any*
  browser chrome (URL bar, toolbar, loading indicator) when Digital Asset
  Link verification fails. `npm run verify` now actually fetches your live
  `https://<host>/.well-known/assetlinks.json` and confirms it matches this
  build's signing fingerprint, instead of just printing a reminder. Fix
  whatever it flags and no browser UI — default or otherwise — will appear.
- **Pinch/double-tap zoom** — this is the one piece that genuinely cannot be
  turned off from Android app code: a TWA renders your site through the
  user's real browser (or, on the rare `fallbackType: "webview"` fallback,
  through `android.webkit.WebView`), and both honor the page's own
  `<meta name="viewport">` tag exactly like any browser tab would. `npm run
  check-viewport` (also run automatically, and --strict by default, before
  every build) fetches your live site and now ABORTS the build if a
  zoom-disabling viewport tag isn't found - zoom must never be possible in
  a generated app. If it's missing, add this to the `<head>` of every page
  on your site:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  ```
  `viewport-fit=cover` is required: without it `env(safe-area-inset-*)` is 0
  and content sits under the system bars (edge-to-edge is enforced on
  targetSdk 35+). The toolkit's default targetSdk is already 36.
  Run it manually any time with:
  ```bash
  npm run check-viewport -- --profile myapp --strict
  # or explicitly opt out of the build-blocking behavior:
  npm run build -- --profile myapp --allow-zoom
  ```

### Site-side files: `twa-mobile.js` (mobile-only, themed UI, no zoom)

`npm run build` also writes `output/<profile>/web/` (`twa-mobile.js`,
`head-snippet.html`, `manifest-patch.json`). Inside the installed app only
(never in a normal browser tab), `twa-mobile.js`:

- forces the mobile viewport even if the user chose "Desktop site" in Chrome,
  and forces `maximum-scale=1, user-scalable=no, viewport-fit=cover`
  (also blocks pinch, Ctrl+wheel and Ctrl +/- zoom);
- shows a theme-colored top progress bar for page loads, `fetch` and XHR
  (`progressBar` in the profile);
- themes browser defaults: form controls, scrollbars, text selection, focus
  ring, `<progress>`, autofill, color-scheme (`ui.nativeTheme`);
- draws a themed pull-to-refresh: circle = `background`, border = `border`,
  spinner = `ring` (each has a `*Dark` variant).

**Automatic vs manual.** Set `webRoot` (path to your site's static/public
folder) in the profile and `npm run gen-web -- --profile <n>` (also run by
`build`) copies `twa-mobile.js` there, merges `manifest-patch.json` into your
manifest (`webManifestPath` if it isn't `manifest.json`/`manifest.webmanifest`)
and injects `head-snippet.html` first in `<head>` of every file listed in
`webHtml`. Re-running is safe. With a framework (Next/Vite/etc.) put the
snippet in your root layout/`index.html` once instead. Without `webRoot` you
must do those three steps by hand. In both cases you still have to
**deploy the site**, since the app loads the live site.

`pullToRefresh.enabled`: `"auto"` (default) turns the toolkit's pull-to-refresh
off when your page already has its own (a `data-ptr`/`pull-to-refresh`
element, `overscroll-behavior` set, or `<meta name="twa-ptr" content="off">`);
`true` forces it on, `false` forces it off.

---

### 4c. Wiring the site, by architecture

Whatever your stack, four things must be true on the live site. The toolkit
can do the first (and the manifest merge) for you via `webRoot`; the rest
depends on how your site renders HTML.

1. `https://<host>/twa-mobile.js` is served (file lives in the site's public/static folder).
2. Every page loads that script, as early as possible, from the server-sent HTML.
3. The viewport is `width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`
   (`twa-mobile.js` also forces this in the app, but the server HTML should be right too; `check-viewport` reads the server HTML).
4. The live web manifest has the values from `manifest-patch.json`.

Keep `webHtml: []` and `webManifestPath: ""` unless your site is plain static
HTML. `webRoot` is the folder that is served at `/`.

| Stack | `webRoot` | Where the script + viewport go |
|---|---|---|
| Plain static HTML | the site folder | set `webHtml: ["index.html", ...]` and the toolkit injects the snippet |
| Next.js App Router | `<project>/public` | `app/layout.tsx` (below) |
| Next.js Pages Router | `<project>/public` | `pages/_document.tsx` (below) |
| Vite / CRA React SPA | `<project>/public` | `index.html` (Vite: project root, CRA: `public/`); `webHtml: ["../index.html"]` works for Vite |
| Nuxt 3 | `<project>/public` | `nuxt.config.ts` -> `app.head` (`script`, `meta`) |
| SvelteKit | `<project>/static` | `src/app.html` `<head>` |
| Remix / React Router | `<project>/public` | `app/root.tsx` `<head>` |
| Astro | `<project>/public` | base layout `<head>` |
| WordPress / PHP | theme or site root | `header.php` / `wp_head`, file in the theme or web root |

**Next.js App Router** (`app/layout.tsx`):

```tsx
import Script from 'next/script';
import type { Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, minimumScale: 1, maximumScale: 1,
  userScalable: false, viewportFit: 'cover', themeColor: '#8c5a3c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script src="/twa-mobile.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
```

`beforeInteractive` only works in the root layout. `suppressHydrationWarning`
is needed because the script sets attributes and CSS variables on `<html>`.
If your manifest is `app/manifest.ts` (not `public/manifest.json`), the toolkit
cannot merge it: copy the keys from `output/<profile>/web/manifest-patch.json`
into it by hand.

**Next.js Pages Router** (`pages/_document.tsx`):

```tsx
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <script src="/twa-mobile.js" />
      </Head>
      <body><Main /><NextScript /></body>
    </Html>
  );
}
```

Do not set a viewport meta in `_app.tsx`; Next warns about it there.

**Vite / CRA / any `index.html`**: paste `output/<profile>/web/head-snippet.html`
as the first thing in `<head>` once (the root document is shared by every route).

**Common mistakes**
- Script added only on some routes or in a client-only component: it must be in the root layout/document so every page has it.
- Script injected by JavaScript after load: the zoom lock arrives late and `check-viewport` can't see it.
- Cached old `twa-mobile.js` (CDN / service worker): after re-running `gen-web`, redeploy and purge the cache.
- Site has its own pull-to-refresh: leave `pullToRefresh.enabled` as `"auto"`, or add `<meta name="twa-ptr" content="off">`.
- Strict zoom check is skipped on build when `webRoot` exists locally (the site may not be deployed yet): always run `npm run check-viewport` after deploying.

---

## 5. Sign

Gradle produces the bundle unsigned, so sign it. The APK is already signed
by `npm run build`:

```bash
npm run sign -- --profile myapp
```

This signs the default output path
(`output/myapp/app/build/outputs/bundle/release/app-release.aab`) with the
keystore from the profile. To sign a different file:

```bash
npm run sign -- --profile myapp --file path/to/app-release.aab
```

Signing an `-unsigned.apk` file saves the signed result as `app-release.apk`
and removes the unsigned file. APK signing needs `apksigner` from the Android
SDK build-tools.

---

## 6. Verify

Checks the signature, confirms `targetSdkVersion` compliance, and prints a
reminder + exact fingerprint for your site's Digital Asset Links file:

```bash
npm run verify -- --profile myapp
```

Add `--apk` to check the signed APK instead of the AAB:

```bash
npm run verify -- --profile myapp --apk
```

---

## 7. Digital Asset Links (`assetlinks.json`)

Required for the app to open **fullscreen** instead of showing a browser
address bar. Print the exact JSON your site must host:

```bash
npm run patch -- --profile myapp          # (already run as part of build, shown here for clarity)
node scripts/gen-assetlinks.js --profile myapp
```

Host the printed JSON at:

```
https://<your-domain>/.well-known/assetlinks.json
```

served with `Content-Type: application/json`, over HTTPS, no redirects.

To also write it to disk:

```bash
node scripts/gen-assetlinks.js --profile myapp --write
```

---

## 8. Upload to Google Play

Upload the `.aab` from step 4/5 directly in Play Console → your app →
Production/Testing track → Create new release. No further conversion needed.

---

## One-liner (after profile + keystore are set up)

```bash
npm run build -- --profile myapp && npm run sign -- --profile myapp && npm run verify -- --profile myapp
```

---

## Command reference (all of them)

| Command | What it does |
|---|---|
| `npm run doctor` | Checks Node/Java/keytool availability |
| `npm run list-profiles` | Lists all valid profiles in `/profiles` |
| `npm run init -- --profile <name>` | Scaffolds the Android project only |
| `npm run build -- --profile <name>` | Full build: scaffold + patch + Gradle, produces the AAB and a signed APK |
| `npm run patch -- --profile <name>` | Force-patches `build.gradle` SDK versions |
| `npm run patch-theme -- --profile <name>` | Force-patches remaining default (non-themed) splash/notification colors |
| `npm run check-viewport -- --profile <name>` | Checks the live site disables pinch-zoom via its viewport tag |
| `npm run gen-web -- --profile <name>` | Writes `twa-mobile.js`/head snippet/manifest patch; installs them into `webRoot` if set |
| `npm run sign -- --profile <name> --generate-key` | Creates a new keystore |
| `node scripts/sign.js --profile <name> --import-existing <path>` | Imports an existing keystore (e.g. from PWABuilder) |
| `npm run sign -- --profile <name>` | Signs the built AAB |
| `npm run sign -- --profile <name> --file <path>` | Signs a specific file (AAB or APK) |
| `npm run verify -- --profile <name>` | Checks AAB signature + SDK compliance |
| `npm run verify -- --profile <name> --apk` | Checks APK signature + SDK compliance |
| `node scripts/gen-assetlinks.js --profile <name>` | Prints/writes `assetlinks.json` |

Or via the unified CLI (identical behavior, shorter to type once linked):

```bash
npm link
webtwa build --profile myapp
webtwa sign --profile myapp
webtwa verify --profile myapp
```

---

## Profile field reference

```jsonc
{
  "packageId": "com.example.app.twa",   // reverse-domain Android app ID
  "host": "example.com",                 // bare domain (no https://)
  "name": "Example App",                 // full app name
  "launcherName": "Example",             // name under the home-screen icon
  "display": "standalone",               // standalone | fullscreen | minimal-ui

  "webManifestUrl": "https://example.com/manifest.json",
  "startUrl": "/",                       // relative to host

  "iconUrl": "https://example.com/icons/icon-512.png",         // ≥512x512
  "maskableIconUrl": "https://example.com/icons/icon-maskable-512.png",
  "monochromeIconUrl": "",               // optional, for notification icons

  "themeColor": "#000000",
  "navigationColor": "#000000",
  "backgroundColor": "#ffffff",

  "appVersionName": "1.0.0",             // shown to users
  "appVersionCode": 1,                    // must increase every Play upload
  "minSdkVersion": 24,

  "fallbackType": "customtabs",           // customtabs | webview
  "enableNotifications": true,
  "features": {},
  "shortcuts": [],                        // app shortcuts, optional

  "mobileOnly": true,                     // never use the desktop layout inside the app
  "viewport": "width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
  "pullToRefresh": { "enabled": "auto", "threshold": 70, "background": "#fff", "backgroundDark": "#000", "border": "#000", "borderDark": "#fff", "ring": "#000", "ringDark": "#fff" },
  "progressBar": { "enabled": true, "height": 3, "color": "#000", "colorDark": "#fff" },
  "ui": { "nativeTheme": true, "safeArea": "auto", "lockContextMenu": true, "lockSelection": false },
  "webRoot": "",                         // optional: your site's public folder, enables auto-install of web files
  "webHtml": [],                          // optional: HTML files (relative to webRoot) to inject the head snippet into
  "webManifestPath": "",                  // optional: manifest path relative to webRoot

  "signingKey": {
    "path": "keystores/example.jks",      // relative to project root
    "alias": "example",
    "dn": "CN=Example App, OU=Engineering, O=Example Inc, L=City, S=State, C=US"
  }
}
```

---

## Reusing this for another website later

1. `cp profiles/example.json profiles/newsite.json` and fill it in.
2. `npm run sign -- --profile newsite --generate-key`
3. `npm run build -- --profile newsite`
4. `npm run sign -- --profile newsite`
5. Host the printed `assetlinks.json` on `newsite.com`.
6. Upload the `.aab` to Play Console, or share the signed `.apk` for sideloading.

Every site's generated project lives isolated under `output/<profile>/`, and
every keystore under `keystores/`, so profiles never collide.

---

## Troubleshooting

**"Profile not found"** — run `npm run list-profiles` to see valid names;
profile name = filename without `.json`.

**Gradle build fails with SDK/licenses errors** — run
`output/<profile>/gradlew --version` once manually to trigger Bubblewrap/
Gradle's first-time Android SDK license acceptance prompt, then re-run
`npm run build`.

**App opens with a visible URL bar instead of fullscreen** — your
`assetlinks.json` fingerprint doesn't match the keystore that signed the
build. Re-run `node scripts/gen-assetlinks.js --profile <name>` and make sure
the exact JSON is live at `/.well-known/assetlinks.json` on your domain.

**"Icon download failed / 403"** — your `iconUrl` / `maskableIconUrl` must be
publicly fetchable (no auth wall, no hotlink protection) and ≥512×512px PNG.

**Play Console rejects for target SDK** — run `npm run verify -- --profile
<name>`, if it reports an SDK below the required minimum, run `npm run patch
-- --profile <name> --target 36` and rebuild. Update
`REQUIRED_MIN_TARGET_SDK` in `scripts/verify.js` if Google raises the bar
again in the future.