# Yard Measure — Snow Mode

**Date:** 2026-08-25
**Status:** Design approved, pending implementation plan

## Why

A project manager, new to Alaska from the lower 48, pointed out that Yard
Measure already does most of the work of bidding commercial snow removal. Snow
was never considered when the app was built. This design adds a snow mode rather
than a second app, because snow needs the *same* measurements the app already
takes — areas, cut-outs, runs, GPS walking — labelled by surface and totalled
differently. Duplicating the measuring engine into a separate app would mean
maintaining two copies of the expensive, field-proven part.

Sequenced deliberately before the app's tutorial video, so the tutorial does not
need re-shooting.

## The hard boundary: no pricing

**The app produces quantities and site facts. It never produces dollars.**

Buildertrend owns pricing at Titan, and the app's author does no pricing — other
people use his tools to arrive at prices. Everything downstream of a dollar sign
is out of scope, and that includes labour hours: hours are only useful against a
labour rate, and shipping production rates would make the app the authority on
something only Titan's real crew times can settle.

Related: **no invented constants.** Any value that is a judgment call is entered
by the user and visible on screen, never baked into the code as though it were
fact. Published lower-48 figures for snow compaction or machine productivity
would read as authoritative six months later when nobody remembers where they
came from.

## Scope

Anchorage only. Titan has no Mat-Su snow contracts, and valley snow is a
different problem — far less accumulation, and wind scours the lots. Do not
design for valley site conditions.

## Data model

### Season

`state.season`: `'summer' | 'snow'`, default `'summer'`.

**Sticky app-wide, but a saved job restores its own.** The flag persists like
`theme` does, so it does not flip while a crew works through a run of sites in
one session — that matters when a single contract spans a dozen-plus properties.
A job saved in snow also records its season and restores it when reopened, so
snow work reopened in July does not present the Materials panel and read as
though it had vanished.

It changes exactly three things:

1. Which surface options the zone chips offer
2. Which panel renders below the map (Materials vs. Snow)
3. What the summary text and snapshot PNG print

Summer mode renders identically to today. A user who never toggles the season
sees no change whatsoever.

### Surface

`zone.surface`, used only in snow mode, orthogonal to the existing `zone.mode`:

| Surface | Meaning |
|---|---|
| `plow` | Machine clears it — lot, drive lanes, aprons |
| `walk` | Shovel or blower — sidewalks, paths |
| `hand` | Stairs and anywhere machinery cannot reach; slow, careful clearing |
| `storage` | Where the piles go. Not cleared — filled |

`mode` (`area` / `cut` / `line`) stays purely geometric and is unchanged. A
parking lot is an `area`, an island in it is a `cut`, a sidewalk is a `line`.
Collapsing the two fields would mean re-teaching geometry the crews already know.

Availability by mode:

- `area` zones: all four surfaces
- `line` zones: `plow`, `walk`, `hand` (a linear run of storage is meaningless)
- `cut` zones: no surface. A cut subtracts from its parent regardless of season.

### Run width

A `line` zone in snow mode gains `widthFt`. Snow volume needs square feet, but
outlining a 400-foot sidewalk means four-plus corners in the dark in February.
Two pins and a typed width is the field-speed win:

    run_sqft = zoneLenFt(z) × z.widthFt

A run with no width set contributes linear feet to the totals but no square
feet, and the panel says so rather than silently dropping it.

### Fleet setting: pile height

`state.pileHeightFt` — persisted as a **preference across jobs**, not a per-job
or per-zone field.

The limiting factor on a snow pile is the loader's total lift, so the ceiling is
a property of Titan's fleet rather than of any particular site. The main machine
is a **Doosan DL250** wheel loader.

**Default: 20 ft.** The finished height of a stacked pile, in feet, set by the
operator. This is Titan's own working figure, not a derived one — which is why
it may ship as a default where the judgment values below may not.

**No manufacturer figure governs this number, and none may be shown in the UI.**

Titan does not stack by dumping. The bucket is never emptied over the pile —
the loader is used as a plow, pushing snow up the face of the pile it has
already built, climbing the ramp as the pile grows. The limit is therefore how
far up that face the machine can climb and still push: traction and slope
stability, both site conditions and operator judgment.

Published loader specifications describe a dumping operation Titan does not
perform. Dump clearance and hinge pin height were briefly recorded here during
design and **deliberately removed** — they would invite a reader to sanity-check
an entered height against a figure with no bearing on how these piles are
actually built. Do not reintroduce them.

The height comes from the person running the machine. Overridable per site,
since traction and available run-up vary.

**This is also why `packingFactor` is well below 1.** A push-stacked pile is a
ramped wedge with sides at their natural angle of repose, not a box filling its
footprint to a uniform height.

### Contract terms

Two per-job fields recording what a site's contract demands. Both are **site
facts carried alongside the measurement**, not inputs to a price.

- `job.removalWindowHrs` — set when the contract requires snow to be hauled off
  within a fixed window of an event. **Opt-in, default off.** At present exactly
  one Titan contract carries a removal clause, at 48 hours, so making it the
  default would misdescribe every other site.
**Both are sticky.** A new job seeds them from the last values entered; a saved
job reopened uses its own. One contract can span a dozen-plus properties — the
ANTHC campus is roughly thirteen sites, all on the same 48-hour removal window
and 1-inch trigger — and retyping two numbers per site is how the thirteenth
site quietly ends up on the wrong trigger.

- `job.triggerDepthIn` — the accumulation that obliges a callout. Recorded and
  printed on the export; **no math in v1**. It drives how many times a season a
  crew rolls out, and seasonal totals are out of scope. The same contract with
  the 48-hour clause triggers at 1 inch, which is aggressive for commercial work
  and is exactly the kind of term that must not get lost between the walk and
  the estimate.

## Storage capacity

The question a square-footage number cannot answer: **does this site hold its
own snow, or does it start going in trucks?** Haul-off is the largest cost swing
in a snow contract and is invisible in a raw area figure.

This matters more in the 2026–27 season than it would have previously: **Titan
is not running its own dump this year** and will be using outside sites. Every
cubic yard over a site's storage now leaves on someone else's terms rather than
being an internal shuffle.

    cleared_sqft = sum over every plow / walk / hand zone of:
                     area zones -> zoneNetSqft(z)   (cut-outs already subtracted)
                     line zones -> zoneLenFt(z) × z.widthFt, or 0 if no width set
                   storage zones and cut zones contribute nothing

    capacity_yd3 = (storage_sqft × pileHeightFt × packingFactor) / 27

    snow_yd3     = (cleared_sqft × eventDepthIn / 12) / 27 / compactionRatio

    excess_yd3   = max(0, snow_yd3 − capacity_yd3)
    loads        = ceil(excess_yd3 / truckCapacityYd3)

**`compactionRatio` is defined as fresh volume ÷ piled volume.** A ratio of 3
means three cubic feet of fresh snow becomes one cubic foot once plowed and
piled. This direction must be stated in the UI label, because the inverse
reading is equally natural and would be wrong by a factor of nine.

**`packingFactor` accounts for a pile being a wedge, not a box** — the storage
footprint never fills to its full height across its whole area.

### Storage zones do not subtract

A storage zone neither adds to nor subtracts from cleared area. The pile usually
sits on ground that is also plowed — the same ground serving two purposes — and
that overlap is correct, not a double-count. Storage must **not** behave like a
`cut`, and must not trigger the existing overlap or orphan-cut warnings, which
only inspect `mode === 'cut'`.

### Values the user sets

Shipped blank or with a visibly-placeholder default, each labelled as an
assumption on screen:

- `packingFactor`
- `compactionRatio`
- `truckCapacityYd3`
- `eventDepthIn` (the snowfall scenario being tested)
- `sandRateLbsPer1000Sqft`

## The Snow panel

Replaces the Materials panel when `season === 'snow'`. Outputs, **kept separate
and never summed**:

- **Plow** sq ft
- **Walk** sq ft, and linear ft
- **Hand** sq ft
- **Storage** — see the two cases below
- **Ice control** — tons per application over total cleared sq ft:
  `tons = (cleared_sqft / 1000) × sandRate / 2000`
- **Contract terms**, when set — trigger depth, and the removal window

### Storage reads differently under a removal clause

A contractual removal window changes what the storage number *means*, so the
panel leads with a different figure:

- **No removal clause** — the question is whether the site copes on its own.
  Leads with **fits**, or **over by N yd³ / N loads**.
- **Removal clause set** — the snow leaves regardless of whether it fits, so
  capacity is no longer the headline. Leads with **total N yd³ / N loads**, and
  reports storage underneath as how much can be staged on site while the crew
  works through the haul within the window.

Same arithmetic in both cases. Only the emphasis changes, because under a
removal clause "it fits" is not a reprieve.

Separation is the whole point. Lot, sidewalk and hand-work are distinct work and
whoever prices the job needs them as distinct lines. A single combined square
footage would destroy the information the walk was done to collect.

## Export

The snapshot PNG and the copyable text summary each get a snow variant printing
the surface-separated totals and the storage verdict, so output still lands in
Buildertrend the way it does today.

## Migration

Existing saved jobs carry no `season` and no `surface`. Both default on load —
`season: 'summer'`, `surface: 'plow'` — following the pattern already in the
loader:

    state.zones.forEach(z => { if (!z.mode) z.mode = 'area'; });

The storage schema version stays at `v: 2`. Adding defaulted fields is
backward-compatible, and bumping the version would strand jobs currently sitting
on crew phones.

## Out of scope for v1

- Anything with a dollar sign
- Labour hours and machine production rates
- Events per season / seasonal totals (per-event quantities only)
- Per-zone pile heights — the loader's lift is one number for the whole site
- Separate ice-control rates per surface — one rate over total cleared area;
  revisit only if it bites

## Known limitations, as built (2026-08-26)

**The accuracy range under the snapshot headline does not model a sidewalk's
width uncertainty.** The band comes from `areaSigmaSqm`, which propagates GPS
uncertainty around a closed polygon. A run measured as two pins plus a typed
width contributes nothing to it. Since runs now feed the cleared-area headline,
the printed range under-states true uncertainty whenever runs make up a large
share of the job.

Practical reading: a mostly-plow lot is unaffected — the shortfall is a small
fraction of the total. **A sidewalk-heavy or sidewalk-only job should treat the
printed range as optimistic.** Note also that a typed width is a judgment, not a
measurement, so no GPS-derived formula was ever going to model it well; fixing
this properly means deciding what uncertainty a typed width even carries.

**Storage-only sites** export under a distinct `SNOW STORAGE` headline with no
range, because there is no measured cleared area to bracket.

**Every judgment value ships empty** — packing factor, compaction ratio, truck
capacity, ice-control rate. Until they are filled in once, the storage verdict
reports what it still needs rather than showing a number. This is deliberate;
see the no-invented-constants rule above. `pileHeightFt` is the exception at
20 ft.

**Nothing here has been used on a phone in a yard.** Browser assertions prove
the arithmetic and a human confirmed the exported cards by eye, but neither
proves the panel is usable with gloves on in February. See the field-confirmation
list in the implementation plan.

## Testing

The app is a single HTML file with no test harness, and the measuring engine is
already field-proven. Verification is by inspection and device testing:

1. A summer job saved before this change loads unchanged and renders identically
2. Toggling to snow and back loses no pins, layers or zone names
2a. Setting a removal window flips the storage headline from *fits / over* to
    *total yd³ / loads*, with the same underlying numbers in both readings
3. A storage zone overlapping a plow zone reduces neither, and raises no overlap
   or orphan-cut warning
4. A `line` zone with no width reports linear feet and states that square feet
   are unavailable, rather than reporting zero
5. Storage verdict flips from *fits* to *over* at the expected event depth for a
   hand-checked area, height and packing factor
6. Snapshot and text export both carry the surface split and the storage verdict

Field confirmation on a real phone is required before any of this is described
as working — see the standing note on unverified Yard Measure features.
