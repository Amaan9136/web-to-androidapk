# PROMPT.md — AI Assistant Prompt for webtwa Setup

This file contains a ready-to-use prompt for an AI coding assistant (Claude,
ChatGPT, Cursor, etc.). Paste it in as-is at the start of a session when you
want the assistant to walk you — interactively, one question at a time —
through turning **your** website's PWA into a signed Android App Bundle using
the [`web-to-androidapk`](https://github.com/Amaan9136/web-to-androidapk)
toolkit.

The assistant is expected to clone the repo, read `RUN.md` for the
authoritative command reference, then drive the whole flow: gathering your
site's manifest info, writing your profile JSON, setting up a keystore,
running the build, and producing a signed `.aab` plus the `assetlinks.json`
your site needs to host.

---

## The Prompt

```
You are setting me up with `web-to-androidapk`, a toolkit that converts any
website's PWA into a signed Android App Bundle (.aab) for Google Play. It's
built on Google's real Bubblewrap library, not a wrapper around a website.

Repo: https://github.com/Amaan9136/web-to-androidapk

Do this:

1. Clone the repo (or, if you can't clone, fetch and read RUN.md and
   README.md directly from GitHub) and run `npm install`.
2. Read RUN.md in full — it is the authoritative reference for every command,
   flag, and profile field in this project. Follow it exactly; don't invent
   flags or commands that aren't documented there.
3. Run `npm run doctor` and tell me what's missing (Node, JDK, Android SDK
   build-tools) before we go further, with install instructions for whatever
   I'm missing.
4. Before interviewing me, ask me to upload or paste my site's
   `manifest.json` (or give you the live URL to it) — mention that having
   this on hand makes the whole interview much quicker, since it can
   auto-fill most of the profile fields (name, icons, theme/background
   colors, start_url, display mode) instead of me typing them one by one.
   - If I have one: read it, extract everything it already gives you
     (name/short_name, icons array — pick the largest for iconUrl and any
     icon whose `purpose` includes "maskable" for maskableIconUrl,
     theme_color, background_color, start_url, display), and show me what
     you found mapped to profile fields before asking me to confirm or
     correct any of it. Only ask me individually about fields the manifest
     doesn't cover (packageId, host, launcherName, appVersionName/Code,
     minSdkVersion, fallbackType, notifications, signingKey).
   - If I don't have one, or my site doesn't have a manifest.json yet: tell
     me that's fine, offer to help me create a minimal one afterward (a PWA
     needs one anyway for installability), and fall back to interviewing me
     one question at a time, in this order, to build my profile JSON
     (profiles/<mysite>.json, copied from profiles/example.json):
     - What should I call my profile? (this becomes the filename and the
       --profile value everywhere)
     - My site's bare domain (host), e.g. mysite.com
     - The full URL to my web app manifest (webManifestUrl) — if I don't
       know it, help me find it: it's usually linked from my site's <head>
       as <link rel="manifest" href="...">, or I can tell you my homepage
       URL and you can check for me.
     - Reverse-domain Android package ID (packageId), e.g. com.mysite.app.twa
       — suggest one based on my domain if I'm not sure.
     - App name and launcher name (name, launcherName)
     - Display mode: standalone, fullscreen, or minimal-ui
     - Icon URLs: a >=512x512 PNG icon (iconUrl) and a maskable version
       (maskableIconUrl). Explain what "maskable" means.
     - Theme color, navigation color, background color (hex)
     - Start URL (usually "/")
     - App version name (e.g. "1.0.0") and version code (starts at 1, must
       increase every future Play upload)
     - Minimum Android SDK version (default 24 is fine for most sites —
       explain the tradeoff if I ask)
     - Fallback type: customtabs or webview
     - Whether to enable notifications
   Either way, still ask me one at a time about anything a manifest can't
   supply: profile name, packageId, host, launcherName, appVersionName,
   appVersionCode, minSdkVersion, fallbackType, and notifications.
   As you go, validate what I give you: fetch my manifest.json and icon URLs
   yourself if you can, confirm the icons are actually >=512x512 and
   publicly reachable, and flag anything that looks wrong (private/localhost
   URLs, non-PNG icons, missing fields) before writing the file.
5. Write the completed profiles/<mysite>.json for me.
6. Ask me whether this is a brand new app or an update to something already
   published on Google Play:
   - If it's an update, I already have a keystore from a previous
     PWABuilder export or similar — walk me through updating the
     signingKey block in my profile to match it, then running
     `node scripts/sign.js --profile <mysite> --import-existing <path>`.
     Warn me clearly that reusing the same key is mandatory for Play Store
     updates and that losing it means I can never update that package again.
   - If it's brand new, walk me through
     `npm run sign -- --profile <mysite> --generate-key`, explain the
     keystore/key password prompts, and remind me to back up the resulting
     .jks file somewhere durable.
   Either way, tell me about the WEBTWA_KEYSTORE_PASSWORD /
   WEBTWA_KEY_PASSWORD env vars and the .env file option so I never type a
   real password into a place that gets committed or logged.
7. Run the build for me: `npm run build -- --profile <mysite>`. Explain what
   it's doing (scaffolding via Bubblewrap, patching targetSdkVersion,
   running the Gradle release build), and tell me it may take a while on
   first run because it downloads Gradle + Android build tools.
8. Sign the output if it isn't already signed:
   `npm run sign -- --profile <mysite>`.
9. Verify it: `npm run verify -- --profile <mysite>`. Show me the result,
   including the signing fingerprint.
10. Generate my assetlinks.json:
    `node scripts/gen-assetlinks.js --profile <mysite> --write`. Tell me
    exactly where to host it (https://<my-domain>/.well-known/assetlinks.json,
    served as application/json, HTTPS, no redirects) and why it matters
    (without it my app shows a browser address bar instead of opening
    fullscreen).
11. Tell me exactly where the final .aab landed
    (output/<mysite>/app/build/outputs/bundle/release/app-release.aab) and
    what to do with it in Google Play Console (Production/Testing track →
    Create new release → upload).
12. If anything fails at any step, check the Troubleshooting section of
    RUN.md first before improvising a fix, and tell me which documented
    issue it matches.

Ask me only one question at a time. Don't skip ahead or assume defaults for
fields that affect app identity (packageId, host, signingKey) — those are
the ones that are painful to change later. For everything else, propose a
sensible default and let me confirm or override it rather than asking me to
type it from scratch.
```

---

## Notes for whoever runs this prompt

- The assistant needs shell/code-execution access (or an equivalent tool
  that can run `npm`, `node`, and Gradle) to actually carry the flow through
  to a signed `.aab` — read-only chat access will get you a filled-in
  profile and a list of commands to run yourself, but not a built app.
- `packageId`, `host`, and the signing key are the fields you cannot safely
  change after your first Google Play upload. If you're not sure about one
  of them, stop and check rather than letting the assistant guess.
- This prompt intentionally defers to `RUN.md` as the source of truth so
  that if the toolkit's commands or flags change, you only need to update
  `RUN.md` — the prompt itself doesn't need to be kept in lockstep with
  every script change.