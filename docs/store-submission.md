# Getting Yard Measure onto Google Play and the App Store

**Written:** 2026-08-29
**Status:** planning — nothing submitted yet

This is the working plan for shipping Yard Measure as a store app. It records what
was verified against current store policy, what is already done, and the decisions
that are yours to make.

---

## The single most important decision: register as an organization, not a person

Google requires every app published from a **personal** Play Console account created
on or after 13 November 2023 to run a closed test with **at least 12 testers, opted in
continuously for 14 days**, before it can go to production. There is no shortcut and no
appeal.

**Accounts registered as an organization — a real legal business entity — are exempt
entirely.**

Titan Alaska is a real business. Registering the Play developer account as an
organization rather than as an individual removes a 14-day gate and the job of finding
twelve people to install a pre-release build.

An organization account needs a D-U-N-S number (free from Dun & Bradstreet, allow up to
30 days) and the business details to match it. **Start the D-U-N-S lookup first** — it
is the longest-lead item in this whole plan and everything else can proceed in parallel.

---

## Decisions I need from you

| # | Decision | Why it blocks |
|---|---|---|
| 1 | **Publisher legal name** as it should appear on both stores | Goes in the privacy policy, the Play listing and App Store Connect. All three must match. |
| 2 | **A contact email you are willing to publish** | Required on both stores and in the privacy policy. It becomes public. Consider a role address rather than a personal one. |
| 3 | **Organization or individual account** (see above) | Changes the timeline by weeks. |
| 4 | **Apple at all, or Play first?** | See the Apple risk below. My recommendation is Play first. |

Both placeholders are marked `[PUBLISHER]` and `[CONTACT EMAIL]` in `privacy.html`,
with a yellow box at the top that must be deleted before publishing.

---

## Google Play

### Privacy policy

Play requires the policy to be in **two** places: the Privacy policy field in Play
Console, **and reachable from inside the app**. The listing link alone is not
sufficient.

- Hosted at: `https://titanalaska.github.io/Yard-Measure/privacy.html` once merged
- In-app link: **not yet built** — see "Code work still outstanding"

### Data safety declaration

Google defines *collected* as *transmitted off the device* — including to third
parties, not just to your own server. That single definition drives every answer below.

The app has **no analytics, no ads, no accounts, no server, and no trackers**. That was
verified by auditing every outbound request in the source; the only hosts it contacts
are map imagery, address search, and the CDN that delivers the mapping library.

| Question | Answer | Reasoning |
|---|---|---|
| Does your app collect or share user data? | **Yes** | Only because map requests leave the device. Nothing reaches us. |
| **Location → Approximate location** | Collected: **Yes** · Shared: **Yes** | Centring the map on the user means the tile request reveals roughly where they are to the imagery provider. |
| Purpose | **App functionality** only | Not analytics, not advertising, not personalisation. |
| Is it required or optional? | **Optional** | The app works fully by tapping corners on imagery if location is refused. |
| **Location → Precise location** | Collected: **No** | The GPS fix itself is never transmitted. It is used on device and saved on device. |
| Personal info, financial info, health, messages, contacts, calendar | **No** | None are touched. |
| Files and docs | **No** | Exports are created on device and go only where the user sends them. |
| Device or other IDs | **No** | No advertising ID, no `ANDROID_ID`, no device fingerprint. |
| Is data encrypted in transit? | **Yes** | Every endpoint is HTTPS. |
| Can users request deletion? | **No mechanism needed** | Nothing is held off-device. Uninstalling or clearing storage erases everything. |

**The one judgment call** is Approximate location. A stricter reading says map tiles are
a functional necessity, not data collection. I have recommended the conservative answer
because a mismatch between the declaration and the app's actual behaviour is among the
most common causes of listing suppression, and over-declaring is not penalised while
under-declaring is.

### Prominent disclosure

Play requires an in-app disclosure shown **immediately before** the location permission
prompt, explaining what location is for. It cannot live in the store description or on a
website, and the privacy policy does not satisfy it.

The app currently calls `startGPS()` on load with no disclosure. **This is a required
change** — see below.

Good news: the app uses **foreground location only** (`watchPosition` while open). It
never requests background location, which avoids the far heavier background-location
review process entirely. Keep it that way.

### Packaging

Play accepts PWAs through a **Trusted Web Activity** (TWA), which is a thin Android
shell around the existing site. Build it with Bubblewrap or PWABuilder.

A TWA requires **Digital Asset Links** to prove the app and the site are the same
owner — a `assetlinks.json` file containing the app's signing-key SHA-256 fingerprint,
served from `https://titanalaska.github.io/.well-known/assetlinks.json`.

> **Watch this:** GitHub Pages serves the project at `/Yard-Measure/`, but Digital Asset
> Links must sit at the **domain root**, which for `titanalaska.github.io` is the
> user/organization Pages site, not this repo. Confirm early which repo controls the root,
> or plan for a custom domain. Getting this wrong is a common late surprise.

---

## Apple — read this before spending the $99

Apple's **Guideline 4.2 (Minimum Functionality)** rejects apps that are "not
sufficiently different from a mobile web browsing experience." Apple calls a website in
a web view a *web clipping*, and rejects them routinely. A straight WKWebView wrapper
around this HTML is exactly the shape that gets rejected.

**The case in this app's favour** is genuinely strong, and worth making explicitly in
the review notes:

- Continuous GPS measurement — walking a boundary and averaging fixes is a hardware
  capability, not a web page
- Works fully offline via the service worker, including cached imagery
- Screen wake lock during field work
- Produces and shares files (snapshot images, JSON, CSV)
- Zero of it is a repackaged marketing site

**My recommendation:** ship Play first with the TWA. It is the low-risk, well-trodden
path and it puts the app in real hands. Treat Apple as a second phase, and when you do
it, use **Capacitor** rather than a bare web view — native geolocation and filesystem
plugins give reviewers concrete native behaviour to point at, which is the difference
between a 4.2 rejection and an approval.

### If and when you do submit to Apple

**Privacy nutrition labels** — mirror the Play answers: Location → *App Functionality*,
**Not Linked to You**, **Not Used for Tracking**.

**Usage description string** — Apple rejects vague ones. Draft:

> `NSLocationWhenInUseUsageDescription`
> "Yard Measure uses your location to place measurement points as you walk a site's
> corners, and to show where you are on the map. Your location stays on your device."

Do **not** add `NSLocationAlwaysAndWhenInUseUsageDescription`. The app has no background
use and asking for it invites scrutiny it cannot pass.

**Privacy manifest** (`PrivacyInfo.xcprivacy`) is required, declaring required-reason API
use — a web-view wrapper touches `UserDefaults`, which needs a declared reason code.

---

## Code work still outstanding

Neither of these is optional for Play.

1. **In-app privacy policy link.** A link to `privacy.html` from the Jobs sheet.
   Small.
2. **Prominent location disclosure.** A one-time explanation shown *before* the first
   GPS request, with an explicit continue. Must name what location is used for and must
   appear before the system permission dialog. Moderate — it changes app startup, so it
   needs care and device testing.

Two more that are not policy requirements but are worth doing before wide distribution:

3. **Rotate and restrict the TomTom API key.** A live key is embedded in
   `index.html` and is already public via GitHub Pages, so it is extractable and
   billable to you. Restrict it by referrer/domain in the TomTom console — and note
   that referrer restrictions behave differently inside a TWA, so test it there.
4. **Vendor MapLibre locally instead of loading it from unpkg.** Removes a third party
   from the privacy policy, removes a runtime dependency on someone else's CDN, and
   makes a cold offline start more reliable.

---

## Costs and timeline

| Item | Cost | Lead time |
|---|---|---|
| D-U-N-S number (organization account) | Free | Up to 30 days — **start first** |
| Google Play developer account | $25 once | Days |
| Apple Developer Program | $99/year | Days, longer for an org |
| Closed testing, personal account only | Free | 14 days + finding 12 testers |
| Closed testing, organization account | — | **Exempt** |

---

## Sources

Verified against current policy on 2026-08-29:

- [Play: Data safety section](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Play: Prominent disclosure and consent](https://support.google.com/googleplay/android-developer/answer/11150561)
- [Play: Testing requirements for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Apple: App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
