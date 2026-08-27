# Yard Measure — Fence Takeoff (universal layer)

**Date:** 2026-08-26
**Status:** Draft for review

## Why

Joe does a lot of fence quotes, and linear measurement is a major summer need.
His crew already builds a material list *after* they know the linear footage —
so the footage is not the deliverable, it is the input to the deliverable.

The thing worth building is narrow and specific: **the app already knows where
the corner posts go.** Every pin on a `line` zone is a vertex. The first and last
are terminal posts. Every interior pin is a corner post — exactly where the
heavier post and the bracing go. Line posts fall between them at whatever spacing
the shop uses.

A tape measure cannot hand you that. A walked GPS path can, for free, out of data
the app is already storing. That is the whole justification for this feature; if
it were only multiplying feet by a rate, it would not be worth building.

## The hard boundary: no pricing

**Unchanged from the snow work: the app produces quantities and site facts, never
dollars.** Buildertrend owns pricing. No labour hours, no production rates, no
cost codes — cost codes are Titan's own and vary per job, so the app must not
guess at them.

**No invented constants.** Post spacing, hole depth and concrete per post are all
judgment values, entered by the user and visible on screen. See "Open questions".

## Scope: the universal layer only

Titan builds cedar and composite privacy panels, pickets (traditional, scalloped,
flat-top), two- and three-rail ranch, hogwire in cedar or steel frames, chainlink,
wrought iron, and single/double/driveway gates.

Those count **differently** — panels are one per section, pickets are per foot,
ranch is rails × sections, chainlink is fabric by the foot with heavier terminals.

But three things are **identical across all of them**:

- post count, broken out by terminal / corner / line
- section count
- gate openings

That is the layer the geometry uniquely provides, and it is what this spec
covers. Type-specific takeoffs — pickets, rails, fabric, panel counts — are
explicitly **out of scope for v1**. Build them only if someone asks.

## Data model

### Marking a run as fence

`zone.fence` — a boolean, meaningful only when `isLine(z)`. Set from the zone chip
in the same way `surface` is, or from the panel. An unmarked run behaves exactly
as it does today.

### Fence is summer work

**The fence marking and the Fence panel appear only when the season is summer,
gated on `!isSnow()`.** Fence does not get its own season — it lives inside the
one that already exists.

A run in snow is a sidewalk carrying a width so it yields area to clear. A run in
summer can be a fence carrying posts and gates. Those are two different questions
about the same geometry, and showing either one in the other's season is noise on
a phone screen that has very little room to spare.

This also means the two features never collide: `widthFt` is read only in snow,
`fence`/`gates` only in summer, and neither needs to know about the other.

### Shop settings — persist across jobs

`state.fencePrefs`, own localStorage key, like `snowPrefs`:

- `spacingFt` — maximum on-centre post spacing
- `bagsPerPost` — concrete per hole

Both describe how Titan builds, not a particular site, so they outlive a job.

### Blank first, then remembered

**Ship empty, then retain what the user entered.** The first time anyone opens
the panel there is no spacing and no bags-per-post, and the panel says what it
still needs rather than showing a number. The moment Joe types 8, that becomes
the value every later job starts from.

This is the resolution to a tension the snow work left half-solved. The rule
against invented constants exists because a number chosen in code reads as fact
six months later and nobody remembers where it came from. But shipping blank
forever means retyping the same figure on every job, which is its own way of
getting a number wrong — the snow contract terms hit exactly that, thirteen sites
deep.

Retention gets both: **the app never asserts a value it made up, and never asks
twice.** The default is learned from the person who knows, not guessed by the
person who doesn't. A remembered value is also self-correcting — if Joe's shop
practice changes, he types the new number once.

Two honest limits, neither blocking:

- **Retention is per device.** `localStorage` lives in one browser on one phone.
  If Joe sets spacing on his phone, Matt's phone still starts blank. Same as the
  snow settings, and acceptable for the same reason: the person doing the
  measuring is the person whose number it is.
- **Spacing may not be one number.** Panel fences are constrained by panel width;
  chainlink line posts commonly run further apart. If it turns out to differ by
  fence type, retention keys per type rather than globally — one more reason not
  to have shipped a single invented default.

### Per run

- `zone.gates` — a list of `{ widthFt }`, one entry per opening on that fence line

Gates are per-run because an opening exists at a specific place on a specific
fence line, and a job can have a driveway gate on one run and a walk gate on
another.

## The arithmetic

For a run with `N` pins and segments `s₁…s_{N-1}`:

    sections_i   = ceil(segmentLengthFt_i / spacingFt)
    sections     = Σ sections_i
    posts        = sections + 1

    terminalPosts = 2                    (the two ends)
    cornerPosts   = N − 2                (every interior vertex)
    linePosts     = posts − 2 − (N − 2)  = sections + 1 − N

Sanity check, straight run (`N = 2`): posts = sections + 1, corners = 0,
terminals = 2, line posts = sections − 1. Correct.

**Sections are computed per segment, not on the total length.** A run that bends
must start a new section at the bend — a post lands on the corner. Computing
`ceil(totalFt / spacing)` would quietly under-count posts on every non-straight
fence, and most fences bend.

### Gates

    gateCount     = zone.gates.length
    gateWidthFt   = Σ gate widths
    netFenceFt    = runLengthFt − gateWidthFt
    gatePosts     = 2 × gateCount

**The app does not decide whether a gate post doubles as a line post.** That
depends on where the opening falls and how the crew frames it. The app reports
gate posts as their own line and lets the estimator reconcile. Deciding it in
code would be inventing a judgment, and the observed job data shows gate posts
are a *different part* anyway — the Stinson job used 4x6s for exactly two posts
against twenty-one 4x4s.

### Concrete

    bags = posts × bagsPerPost

Reported only when `bagsPerPost` is set. Hole depth in Alaska is driven by frost,
which is why this is a user value and not a constant — see "Open questions".

## Output

The panel and the exports report, per fence run and as a job total:

- Run length ft
- Gates: count and total width
- Net fence ft
- Terminal posts / corner posts / line posts / **total posts**
- Gate posts
- Sections
- Concrete bags, when set

**Format matters here.** Per Buildertrend's help documentation, estimate line
items carry a Title, Cost Code, Cost Type, Group and Description, and takeoffs
import as line-item rows. So the text export must be **one quantity-plus-unit per
line**, not prose, so it maps onto line items without retyping. No cost codes —
those are Titan's.

Runs already report separately from areas in both exports, and that stays: linear
feet never get summed into square feet.

## Out of scope for v1

- Anything with a dollar sign; cost codes; labour hours
- Type-specific takeoffs (pickets, rails, fabric, panel counts)
- CSV or Excel export — revisit if pasting proves to be the friction
- Fence height as a spec field — no evidence yet it changes a *quantity* the app
  produces, as opposed to which parts get ordered
- Slope, stepping and racking

## Open questions — must be answered before these ship as defaults

1. **Post spacing.** A "Fence Worksheet" card exists in Trello under Project
   Manager Training Material (`trello.com/c/dGAt0N13`); its content is an
   attachment that could not be read through the available tools. Joe can settle
   it in a sentence.
   *Unverified inference from one job, recorded so it is not mistaken for fact:*
   the Stinson list — 370 pickets across roughly 22 sections — works out to about
   2.1 pickets per foot at 8 ft spacing, where 6 ft would imply ~2.8/ft and be too
   dense for standard dog-ear. That leans 8 ft. **Do not ship it as a default on
   the strength of this paragraph.**
2. **Concrete per post**, which follows from hole depth and diameter, which
   follows from frost depth. Not asserted here.
3. **Whether Joe tracks gates per run or totals them at the end.** The spec assumes
   per run. If he totals them, the model simplifies.

**These do not block the build.** Under "Blank first, then remembered", both
fields ship empty and the panel reports what it still needs rather than showing a
number. Whoever answers them answers them *into the app*, once, and it keeps
them from then on — so the questions resolve themselves through use rather than
holding up the work.

## Corroboration from Titan's own records

Two findings from Trello that shaped this spec rather than being assumed:

- **"Fence jobs must add charges for building gate"** is an existing card on the
  Job Costing Checklist. Gates are already a known costing leak, documented
  independently of this work. That is why they are in the universal layer rather
  than deferred.
- **The Stinson fence job** (1242 St. Gotthard) ordered 11× 4x4x8', 10× 4x4x10',
  1× 4x6x8', 1× 4x6x10', one pallet of Quikrete, 370 pickets. Twenty-one line
  posts, two heavier gate posts, and concrete as a real line item — the shape
  this spec produces.

## Testing

Same constraints as the snow work: one HTML file, no test harness by design,
verification by browser-console assertions against the live app plus device
testing.

1. A straight two-pin run yields `sections + 1` posts, 2 terminals, 0 corners
2. A bent run yields exactly `N − 2` corner posts, and its section count is the
   sum of per-segment ceilings — **not** `ceil(total / spacing)`
3. A run whose segment is shorter than one spacing still yields one section
4. Gates subtract from net fence length and add gate posts, without silently
   altering the line-post count
5. Concrete is omitted, not shown as 0, when `bagsPerPost` is unset
6. A run not marked as fence behaves exactly as it does today
7. Areas, cut-outs and snow mode are all unaffected

**Field confirmation on a real phone is required before any of this is described
as working**, and ideally against a fence Joe has already quoted by hand, so the
post count can be checked against a known-good answer.
