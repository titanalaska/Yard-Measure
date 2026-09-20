# Bootprint — Measurement Test Harness

**Date:** 2026-09-19
**Status:** Built. 24 tests passing, all 7 mutations caught.

## Why

Bootprint's measurement functions produce the square footage that goes into
bids. When they are wrong, they are **silently** wrong: a number appears on the
card in the same type as every honest number, and nothing contradicts it.

This has already happened once. The 8/30 union fix corrected a case where a
driveway overlapping an apron was subtracted twice, understating billable
ground. That was found by reasoning about the code, not by a test — and the PMs
still running the old install never received the fix.

Right now the only verification these functions get is someone reading the
output and judging whether it looks right. A harness that pins the arithmetic
to known answers is what replaces that judgement with a check.

## Scope

**In:** the pure geometry and cut-out arithmetic —
`project`, `signedArea`, `polyArea`, `calcAreaSqm`, `calcPerimeterM`,
`triangulate`, `clipConvex`, `overlapSqm`, `intersectAllSqm`,
`zoneSqft`, `cutRemovedSqft`, `zoneNetSqft`, `jobSqft`.

**Out, for now:** map interaction, pin placement by tap, GPS capture, the
snapshot PNG, the site library, and the Apps Script backends of the other two
apps. Those need a different kind of test and would stall this one.

## The design rule that makes this worth building

**Every assertion must have an independently known answer.** A test that
asserts whatever the code returns today locks in the current behaviour,
including its bugs, and catches nothing. Two devices give genuinely independent
answers:

### 1. One absolute-scale check, to validate the projection constant

A rectangle constructed from known lat/lng offsets at Anchorage latitude, sized
to 100 ft x 50 ft, must come back as 5,000 sq ft within 0.5%. This is the only
test that depends on the projection being right, and it is the only one that
needs a tolerance that loose.

### 2. Everything else as ratios, which are projection-independent

If the projection constant were wrong by 3%, every ratio below still holds.
That is the point: these test the *logic*, which is where the bugs have been,
without inheriting the projection's assumptions.

| Property | Expected | What breaks if it fails |
|---|---|---|
| Reversed pin order | identical area | winding-order handling |
| Rotated start vertex | identical area | shoelace wraparound |
| Both dimensions doubled | exactly 4x area | scaling |
| Concave L-shape | equals sum of its two rectangles | triangulation of non-convex shapes |
| Two identical cuts over the same 25% | removes 25%, not 50% | **the union — the 8/30 bug** |
| Three mutually overlapping cuts | inclusion-exclusion exact | `cutRemovedSqft` subset loop |
| Cut half outside the zone | removes only the half inside | `overlapSqm` clipping |
| Cut entirely outside | removes nothing | false subtraction |
| Cut larger than its zone | net floors at 0, never negative | `zoneNetSqft` guard |
| 9 cuts (past `MAX_EXACT_CUTS`) | over-subtracts | the documented conservative fallback |

That last row is deliberate. Past the cap the code abandons exact
inclusion-exclusion for a plain sum, which over-subtracts. The test asserts the
**direction** of the error, because failing conservatively — understating the
ground you bill for — is the intended behaviour, and a future change that made
it over-report would be a real regression.

### 3. One field regression, from a real job

4500 Diplomacy Drive, measured 2026-08-28 (see the field-test note). The
relationships hold regardless of the exact pin coordinates:

- gross areas 104,443 - cut-outs 19,317 = 85,126, against an 85,127 headline
- Plow 84,000 + Walk 1,127 = 85,127
- Storage 3,194 is **excluded** from the total

The third is the storage-is-not-cleared rule, which is easy to undo by accident
while editing the snow panel.

## How it runs

`@playwright/test` with Chromium only. Tests load `index.html` over `file://`
and call the functions directly with `page.evaluate()` — the script block has
no IIFE wrapper, so everything is in global scope, and MapLibre is vendored
locally so nothing needs the network.

This runs the real code in the real runtime. No extraction, no refactor, no
second copy of the math to drift out of sync with the app.

Layout:

```
Yard-Measure-repo/
  package.json            devDependency + `npm test`
  playwright.config.js    chromium only, no web server
  tests/
    helpers.js            build rectangles and L-shapes from lat/lng offsets
    geometry.spec.js      scale, invariants, concave shapes
    cutouts.spec.js       the union, inclusion-exclusion, the cap
    field-regression.spec.js   4500 Diplomacy
  .gitignore              node_modules, test-results, playwright-report
```

`node_modules/` **must** be gitignored. The repo is served by GitHub Pages, so
anything committed is published.

## Failure output

A failing test names the consequence, not the function. `cutRemovedSqft
returned 4812` tells nobody anything; *"two cut-outs on the same ground were
subtracted twice — a bid off this number understates billable area"* says what
went wrong and who it hurts.

## Not doing

**Not wired into the edit hook.** The syntax check runs on every edit because
it takes 50 ms. Launching a browser does not belong there. This is a
pre-deploy check, run with `npm test`.

**Not covering the other two apps.** Inventory has 28 `fetch` call sites
against an authenticated Apps Script URL and needs fixtures before anything can
run headlessly; Wolf is mostly localStorage. Both are worth doing and neither
should hold this up.

## Resolved: `file://` works

Checked before any test was written. `index.html` loads over `file://` with
zero page errors and all fourteen target functions plus `state` reachable from
`page.evaluate()`. No dev server, no localhost fallback needed.

## Added during implementation: proving the tests can fail

All 24 tests passed on their first run, which is not evidence of anything. A
test that cannot fail is decoration.

`tests/mutation-check.js` (`npm run verify-tests`) breaks the measurement math
on purpose — one bug at a time, into a gitignored copy, never touching
`index.html` — and asserts that the test claiming to guard that bug actually
goes red. Seven mutations, each a plausible real edit:

| Deliberate bug | Caught by |
|---|---|
| drop `cos(latitude)` from the projection | longitude shrinks by cos |
| wrong Earth radius | 0.001 deg of latitude is 111.19 m |
| sum overlapping cut-outs instead of unioning (the 30 Aug bug) | come off once, not twice |
| let net area go negative | floors at zero |
| subtract whole cut-outs instead of overlaps | past the cap, only the overlap |
| skip the winding fix in ear clipping | concave lawn clips correctly |
| count snow storage as cleared ground | storage excluded from the headline |

**This found three real holes on its first run**, all of them tests that looked
right and tested nothing:

1. The negative-floor test used a cut that exactly covered its zone, so
   removal equalled gross and the answer was `0` with or without the floor.
   Now nine stacked cuts past the cap, which sum to 32,400 against a 10,000
   sq ft lawn.
2. The straddling-driveway test used one cut, which goes down the exact
   inclusion-exclusion path — so it never reached `cutoutsFor`, where the
   whole-area bug lives. Now a separate test with nine cuts.
3. The L-shape test called `calcAreaSqm`, which is plain shoelace and never
   triangulates. **No area test can reach the ear clipper at all.** Only
   `overlapSqm` triangulates, so the concave case had to become a cut-out test
   — and the lawn is walked clockwise on purpose, since that is what forces the
   winding normalisation the mutation removes.

Keep the mutation list current. If a mutation reports SKIPPED, the code it
patches has moved and that guard is no longer being checked.

## Gotcha worth keeping

`spawnSync('npx.cmd', ...)` fails with `EINVAL` on Node 24 / Windows — Node
will not spawn a `.cmd` without a shell. The failure is silent enough that the
mutation runner reported all seven bugs as slipping through when in fact no
test had run at all. Invoke `require.resolve('@playwright/test/cli')` through
`process.execPath` instead.
