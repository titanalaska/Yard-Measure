# Building the Android package (TWA)

**Written:** 2026-08-30 · **Status:** hosting side done, packaging not started

Play will not accept a website. The PWA has to be wrapped in a **Trusted Web
Activity** — a thin Android app that opens `bootprint.app` full-screen, with no
browser chrome, provided the domain and the app can prove they share an owner.

## Why PWABuilder rather than Bubblewrap

Bubblewrap is the "official" CLI, but it needs a **JDK and the Android SDK
build-tools** — close to a gigabyte of download and setup. Neither is installed
on this laptop, and it is an N200: a 14-minute video encode takes five minutes,
so a Gradle build is not where you want to be.

**PWABuilder** (`pwabuilder.com`) does the same job server-side and hands back a
signed `.aab`. No local toolchain at all.

## Already done

- **`.nojekyll` is committed.** Without it, GitHub Pages runs Jekyll, Jekyll
  drops every dot-prefixed path, and `/.well-known/assetlinks.json` 404s. The
  only symptom is the finished app opening with a browser address bar across the
  top — which looks like an Android bug and is actually a hosting one.
  Verified: the path now returns 200.
- **`.well-known/assetlinks.json` exists** with the right shape and a
  deliberately invalid fingerprint.
- The manifest has everything a TWA needs: name, short_name, start_url, scope,
  `display: standalone`, theme and background colours, and 192/512/maskable
  icons. It is linked from `index.html`.

## The ordering trap

**You cannot finish `assetlinks.json` before the first upload.** New Play apps
are enrolled in **Play App Signing**, which means Google re-signs your build
with *their* key. The fingerprint that has to appear in `assetlinks.json` is
**Google's app-signing certificate, not your upload key**.

Putting the upload key's fingerprint there is the single most common reason a
TWA ships with an address bar. It looks right, it validates as JSON, and it
silently does nothing.

So the sequence is: build → upload → read Google's fingerprint → publish
assetlinks → verify.

## Steps

1. **Create the Play developer account** — $25 one-time, on
   `bootprintapp@gmail.com`, publisher name **Matthew David Walsh**.

2. **Generate the package at pwabuilder.com.** Enter `https://bootprint.app`,
   let it validate, then Package For Stores -> Android.
   - **Package ID must be `app.bootprint.twa`** — it has to match the
     `package_name` already committed in `assetlinks.json`, or verification
     fails.
   - Choose **"Create new signing key"**.
   - **Save the keystore and its password somewhere permanent.** That key is the
     app's identity. Play App Signing means losing it is recoverable, but do not
     rely on that — treat it like the only copy.

3. **Create the app in Play Console** and upload the `.aab` to a **closed
   testing** track.

4. **Get the real fingerprint:** Play Console -> Setup -> App signing -> copy the
   **SHA-256 of the app signing certificate** (not the upload certificate).

5. **Replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256`** in
   `.well-known/assetlinks.json`, commit, push. Wait for the deploy, then
   confirm at `https://bootprint.app/.well-known/assetlinks.json`.

6. **Verify** with Google's checker:
   `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://bootprint.app&relation=delegate_permission/common.handle_all_urls`
   It should return your app with no errors. Then install the test build — if
   there is no address bar, it is working.

7. **Add the 12 testers** and start the 14-day clock.

## Data safety answers

Already worked out in `store-submission.md` — location is collected and shared,
approximate only, app functionality only, optional, never for tracking. Precise
location is used on-device and never transmitted.
