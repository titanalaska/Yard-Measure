# Titan's site seed — 74 properties

This is **data, not code**. `index.html` does not reference this file and must
never learn its path. The app ships with an empty library; this file is one
company's import, and any other company's import is their own file.

That line is the whole point of how the library was built:

> **Capabilities stay in the app. Company data lives in a file.**

## Loading it

Open the app → **Jobs** → **Site library** → **Import** → choose
`site-seed-2026-08-28.json`. Once per device.

Importing it twice produces 74 sites, not 148 — the ids are stable and derived
from label plus address, so a second import is a no-op. Editing a site on the
phone and then re-importing the file does **not** silently revert it: the app
shows what differs and asks.

## What is in it

74 sites across 13 groups, extracted from the SNOW ROUTES / PODS Trello board
on 2026-08-28.

| Field | Notes |
|---|---|
| `label` | What the crew calls the property |
| `address` | Parsed cleanly at 70 of 75 cards |
| `group` | The pod. Called `group` because the field is generic in the app — another company puts a route, a crew or a city in it |
| `customer` | Deliberately **empty** — see below |
| `note` | Empty in the seed; free text on the phone |
| `lat` / `lng` | **null** — a site's coordinates come from the first job measured there |

**Why `customer` is empty.** The board convention turned out to be
`LABEL - ADDRESS`, not `CUSTOMER - ADDRESS`. All 75 cards disprove the latter:

    AHFC - CHUGACH MANOR - 1281 E 19TH AVENUE     three parts
    CIHA SALAMATOF - 9131 CENTENNIAL              customer and site fused
    LITHIA - 5138 OLD SEWARD                      customer only
    1620 STANFORD                                 address only

The customer is sometimes a prefix, sometimes fused into the label, sometimes
absent. Deriving it would be wrong more often than right, so it is a field a
human sets.

## Known gaps

Carried forward from the spec, still open:

1. **Titan's own yard** and **Girdwood Library** have no parsed address. Each
   needs a human to give one, or to say it has not got one.
2. **A JBER site has no street address** at all.
3. **The pod values may be stale for the 2026/27 season.** They ride in this
   file rather than in code, so a wrong value is one edit in the app, not a
   redeploy. If pods are being redrawn before first snow, strip `group` from
   this file and let it fill in as sites get measured.

Two more things cost real time to work out and would be re-derived otherwise:

- **Pod lists on the board are doubled, inconsistently.** `POD 3 -South
  Anchorage` holds only equipment; `Pod -3 South Anchorage (KT)` holds the six
  properties. Same on Pods 8, 9 and 10. The group is knowable, but not from a
  list name alone.
- **One operator's card had leaked into a pod list** and was dropped, and one
  card was missing its dash (TSAIA South Terminal, fixed). That is why the file
  holds 74 sites and the board holds 75 cards.

## What is deliberately not here

The board also holds EQUIPMENT (26), Operators (10), Shovelers (13), HAULING
(4) and Subcontractors (42 across three lists). **None of it belongs in this
app** — this app measures ground, and a loader roster is scope it cannot
maintain. That material is an input to the optimizer Chris described, which is
a separate program.

## Regenerating

There is no script. This file was built by hand from the board and then
reshaped once into the app's import format. If the board changes materially,
edit this file directly — or better, fix it in the app and export the library,
which produces a file in exactly this shape.
