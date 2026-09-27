# RUN.md — webtwa: Web-to-Android PWA Toolkit

Everything you need to turn **any** website's PWA into a signed Android App
Bundle (`.aab`), ready for Google Play — built on Google's real open-source
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
git clone https://github.com/Amaan9136/web-to-androidtwa.git
cd web-to-androidtwa
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
defensively patches `targetSdkVersion` to 36, then runs the Gradle release
build:

```bash
npm run build -- --profile myapp
```

Useful flags:

```bash
# Scaffold + patch only, skip the (slow) Gradle build
npm run build -- --profile myapp --skip-build

# Also produce a debuggable/unsigned APK alongside the AAB
npm run build -- --profile myapp --apk
```

First run downloads Gradle + Android build tools (~1GB) — this can take
several minutes depending on your connection.

Output lands at:

```
output/myapp/app/build/outputs/bundle/release/app-release.aab
```

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
  check-viewport` (also run automatically, as a warning, before every build)
  fetches your live site and fails loudly if it isn't found. If it's
  missing, add this to the `<head>` of every page on your site:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  ```
  Run it manually any time with:
  ```bash
  npm run check-viewport -- --profile myapp
  # or fail the command instead of just warning:
  npm run check-viewport -- --profile myapp --strict
  ```

---

## 5. Sign

If Gradle didn't already auto-sign the bundle (depends on whether
`key.properties` was picked up), sign it manually:

```bash
npm run sign -- --profile myapp
```

This signs the default output path
(`output/myapp/app/build/outputs/bundle/release/app-release.aab`) with the
keystore from the profile. To sign a different file:

```bash
npm run sign -- --profile myapp --file path/to/app-release.aab
```

---

## 6. Verify

Checks the signature, confirms `targetSdkVersion` compliance, and prints a
reminder + exact fingerprint for your site's Digital Asset Links file:

```bash
npm run verify -- --profile myapp
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
| `npm run build -- --profile <name>` | Full build: scaffold + patch + Gradle |
| `npm run patch -- --profile <name>` | Force-patches `build.gradle` SDK versions |
| `npm run patch-theme -- --profile <name>` | Force-patches remaining default (non-themed) splash/notification colors |
| `npm run check-viewport -- --profile <name>` | Checks the live site disables pinch-zoom via its viewport tag |
| `npm run sign -- --profile <name> --generate-key` | Creates a new keystore |
| `node scripts/sign.js --profile <name> --import-existing <path>` | Imports an existing keystore (e.g. from PWABuilder) |
| `npm run sign -- --profile <name>` | Signs the built AAB |
| `npm run sign -- --profile <name> --file <path>` | Signs a specific file (AAB or APK) |
| `npm run verify -- --profile <name>` | Checks signature + SDK compliance |
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
6. Upload the `.aab` to Play Console.

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