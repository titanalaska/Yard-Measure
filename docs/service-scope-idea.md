# Service scope — a zone's role depends on the job, not the ground

**Status:** idea, not built. Captured 2026-08-30 from a field observation.

## The observation

> "In summertime, the baseball field is a good zone. In wintertime, the baseball
> field is a bad zone. Good and bad is not right. Functionality."
> — Matt, measuring Kosinski Fields

The word he was reaching for is **scope**. A ball field is *in scope* for summer
maintenance — it gets mowed, it gets fertilised, it is the work. The same ball
field is *out of scope* in winter, because nobody plows a ball field. The
parking lot is the exact reverse: incidental in July, the entire job in January.

Nothing about the ground changed. The service changed.

## What the app assumes today

A zone has one permanent role, fixed when you draw it:

- `mode: 'area'` — counted
- `mode: 'cut'` — subtracted
- `mode: 'line'` — measured as a run

That role is a property of the **shape**. But the observation above says the
role is really a property of **the shape crossed with the service being
quoted**. The data model is one dimension short.

## What it costs right now

You cannot quote the same site for two services without editing it. To go from
a summer bid to a winter bid on the same property you would re-flag zones by
hand, and either overwrite the summer setup or keep two near-duplicate jobs
that drift apart the moment a corner is corrected.

That is a real cost, because **the site is the expensive part**. Walking a
perimeter or tapping forty corners is the work; toggling what counts is not.
Making someone redo the expensive part to answer a second question is exactly
backwards.

## The shape of a fix

Measure once. Tag each zone with what it *is* — turf, pavement, walkway,
building, storage. Then pick a service, and let that decide which tags count:

| Service | Counted | Ignored |
|---|---|---|
| Summer maintenance | turf, beds | pavement, building |
| Snow | pavement, walkway | turf, building |
| Fence | perimeter runs | everything else |

The totals recompute. Nothing is re-drawn.

This is the existing through-line — *one shape, every answer* — extended one
step further than the app currently takes it. Today the same outline already
answers area, snow and fence questions. This makes it answer them for a **site
with mixed surfaces**, which is what every commercial property actually is.

## Why this is worth more than it looks

It converts the app from a measuring tool into something with a moat. A
competitor can copy corner-tapping in a weekend. A library of properly tagged
sites that answers any service you throw at it is a year of somebody's field
work, and it belongs to whoever built it.

It also compounds with the site library ([[project-yard-measure-site-library]]):
a saved site is worth far more if it answers summer *and* winter than if it
answers only the season it was drawn in.

## Open questions

- Does a zone get **one** tag or several? A gravel lot might be plowed in winter
  and graded in summer — both services, one surface.
- Does the tag replace `surface` (which snow mode already uses: plow / walk /
  hand / storage), or sit beside it? Probably replaces — snow's surfaces look
  like an early, snow-only version of exactly this idea.
- What happens to existing saved jobs? They have no tags. Sensible default:
  everything currently `area` counts for every service, so nothing changes
  until someone opts in.
