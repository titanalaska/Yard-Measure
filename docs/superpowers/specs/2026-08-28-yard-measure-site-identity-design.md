# Yard Measure — Site Library

**Date:** 2026-08-28
**Status:** Draft for review — revised same day, see "What changed"

## Why

Chris wants to feed equipment and sites into a tool that calculates the best
outcome. That optimizer is a separate program and is explicitly not this app.
But it has no inputs unless something builds the library of sites first, and
that is the job this app is already half doing — badly, because **a job's entire
identity today is one free-text `name` string**.

Two sites measured by two people on two phones are, as far as anything
downstream can tell, unrelated rows of text.

## What changed, and why it matters

An earlier draft of this spec baked Titan's 74 properties into `index.html` as a
constant, and proposed a second HTML file to hold the company-specific parts.
Both ideas are dropped.

The app is being shared outside Titan and may end up in a store. That makes two
things true at once:

1. **Shipping the client list in the code is wrong** — ANTHC, CIHA, Lithia, the
   fire stations, addresses and all, inside a public app. Nobody outside Titan
   wants it, and it is not really ours to hand out.
2. **The library itself is not Titan-specific at all.** Any contractor who
   measures the same lots every season wants them saved and pickable. It is a
   feature, not plumbing.

So: **the library is a universal feature that ships empty. Titan's sites are
data that gets imported into it.** One file, one codebase, no company data in
the repo, and a friend who installs it gets a library they fill with their own
work.

The line this draws, and it is worth stating plainly:

> **Capabilities stay in the app. Company data lives in a file.**

Snow mode, fence takeoff, cut-outs, surface colours, pin lock — all universal,
none of it clouds anything. The 74 properties, the pods, the contract terms —
all data.

## The hard boundary: no pricing

**Unchanged.** The app produces quantities and site facts, never dollars.
Buildertrend owns pricing. This spec adds identity, not value.

## The model

### A site is a first-class record

    site = {
      id:       string,         generated on creation, stable forever
      label:    string,         "CIHA KNIK CORNERS", "Miller back lot"
      address:  string,         the field nearly every site has
      customer: string,         optional tag — never derived, only set
      group:    string,         optional — Titan uses it for pod, others for
                                whatever groups their work (route, crew, city)
      note:     string,         optional
      lat, lng: number | null,  centroid of the first job measured here
      createdAt, updatedAt
    }

**A site enters the library two ways, and only two:** it is created when a job
is measured and named, or it arrives in an import. There is no third category
and no privileged built-in set — Titan's 74 are ordinary imported records,
indistinguishable from ones a user typed.

`group` is deliberately generic. Titan puts its pod in it. Someone else puts a
route number, a crew name, or nothing. Naming the field "pod" would be exactly
the kind of company detail that does not belong in shipped code.

### A job points at a site

    job.siteId = string | null

`job.name` stays, derived from the site's label and address when one is linked,
and freely overridable. **Nothing that reads `job.name` today has to change**,
and a job saved before this feature keeps working with `siteId: null`.

### Sites are stored apart from jobs, and this is not incidental

`localStorage` today holds jobs under one key, capped at `MAX_JOBS = 60`, and
`writeJobs` **silently drops the oldest half on quota**. That is survivable for
job history. It would be destructive for a library the user has spent a season
building.

**Sites get their own key and are never trimmed by the job path.** The arithmetic
supports it: a site record is a few hundred bytes, so Titan's whole library is
roughly 15 KB against a ~5 MB budget. All the quota pressure comes from jobs,
which carry every pin. Separating them means the library survives the trim that
eats old jobs.

## Import and export

One mechanism doing three jobs, which is why it is worth building properly:

1. **Titan loads its 74 sites** — import the file once per device
2. **A library moves between phones** — export on one, import on another; the
   nearest thing to durability available without a server
3. **Chris gets his data** — export, hand it over

### Formats

**JSON**, full fidelity, and the only format that round-trips. Carries sites,
jobs, every zone with its pins and coordinates, surfaces, snow and fence
figures, accuracy band, `measuredAt`, and the app version.

**CSV**, flat, one row per zone with site identity repeated on each row, for
anyone opening it in a spreadsheet. **Export only** — CSV cannot represent pin
geometry, so importing one would silently produce sites with no shape.

### Import must be additive and must never overwrite silently

Importing merges into the existing library. A site whose `id` already exists is
**offered**, not overwritten — the user sees what differs and chooses. Anything
else means a stale file can quietly undo a season of corrections.

## Duplicate defence

More important now than in the earlier draft, not less: every measurement is a
candidate new library entry, so the same lot can enter twice by ordinary use.
Three layers, in order of strength:

**1. `siteId` is authoritative.** Two jobs carrying the same `siteId` are the
same site, full stop. This covers every job started by picking from the library,
which will be the large majority.

**2. Normalised address match, on typing.** Upper-case, strip punctuation,
expand the usual abbreviations (`AVE`/`AVENUE`, `RD`/`ROAD`, `HWY`/`HIGHWAY`,
`ST`/`STREET`). Match against the whole library. On a hit, the app **offers** the
existing site — it does not merge.

**3. GPS proximity, as a suggester and not a detector.** When a job's first pin
lands within ~40 m of a library site, offer it by name: *"You're at 8800
Centennial Circle — CIHA Knik Corners?"* A convenience at the moment the crew
arrives.

**Proximity is deliberately not wired to duplicate detection**, because Titan's
own data says it cannot be. Lithia has six sites on Old Seward; 4904 and 4908 are
adjacent lots. CIHA has eight on Centennial and Peck. A radius tight enough to
separate neighbours is too tight to survive ordinary GPS error, and one loose
enough to be reliable swallows them. So proximity suggests, a human confirms,
and `siteId` records the answer.

**Nothing merges automatically, ever.** Auto-merging two sites that are genuinely
different destroys a measurement; surfacing a duplicate costs one tap.

## Titan's import file

`docs/site-seed-2026-08-28.json` — 74 sites across 13 groups, extracted from the
**SNOW ROUTES / PODS** Trello board. **It lives in the repo as a document, not
as code**, and is never referenced by `index.html`.

Four findings from building it, recorded because they cost real time and would
be re-derived otherwise:

**1. The Trello convention is `LABEL - ADDRESS`, not `CUSTOMER - ADDRESS`.**
A sample suggested the latter; all 75 cards disprove it:

    AHFC - CHUGACH MANOR - 1281 E 19TH AVENUE     three parts
    CIHA SALAMATOF - 9131 CENTENNIAL              customer and site fused
    LITHIA - 5138 OLD SEWARD                      customer only
    1620 STANFORD                                 address only

Customer is sometimes a prefix, sometimes fused in, sometimes absent. **Do not
derive it.** Hence customer as its own optional field, set by a human.

**2. Address parsed cleanly at 70 of 75.** Remaining: a note typed into the
address (`GIRDWOOD LIBRARY - OPI IS CONFIRMED AS EMPLOYEE...`), a missing dash
(TSAIA South Terminal, fixed), an operator's card that leaked into a pod list
(dropped), Titan's own yard, and a JBER base with no street address.

**3. Pod lists on the board are doubled, inconsistently.** `POD 3 -South
Anchorage` holds only equipment; `Pod -3 South Anchorage (KT)` holds the six
properties. Same on Pods 8, 9, 10. Group is knowable but not from a list name
alone, and it churns season to season — which is another reason it is an
ordinary editable field.

**4. The board holds more than sites.** EQUIPMENT (26), Operators (10),
Shovelers (13), HAULING (4), Subcontractors (42 across three lists) sit
alongside the properties. That is the equipment-and-sites input Chris described,
already hand-maintained. **It is not going in this app** — this app measures
ground, and a loader roster is scope it cannot maintain.

## Out of scope

- The optimizer itself — a separate tool, per Chris
- Reading from or writing to Trello
- Multi-device sync or any server component
- Equipment, operator or subcontractor records
- Anything with a dollar sign (standing)

## Open questions

1. **Does Chris want JSON or CSV first?** Both are specified; if his tool reads
   one, build that and defer the other rather than shipping an export nobody
   consumes.
2. **Are the pod values current for the 2026/27 season?** They ride in the import
   file, not the code, so a wrong value is one edit rather than a redeploy — but
   if pods are being redrawn before first snow, strip `group` from the file and
   let it be filled in as sites get measured.
3. **Titan's yard and Girdwood Library** have no parsed address. Each needs a
   human to give one, or to say it has not got one.

## Testing

Same constraints: one HTML file, no test harness by design, browser-console
assertions against the live app plus device testing.

1. A fresh install has an **empty** library and no Titan data anywhere in the app
2. A job started from a library site carries its `siteId`; reopening keeps it
3. A typed address matching a library site raises the offer and does **not**
   auto-merge
4. Address normalisation matches `1281 E 19TH AVE` to `1281 E 19TH AVENUE`
5. Two sites 60 m apart (Lithia 4904 / 4908) are never treated as one
6. **Filling job storage past the trim threshold leaves the library intact**
7. Import of the 74-site file produces 74 sites; importing it twice produces 74,
   not 148
8. A job with no site still saves, and still exports
9. `job.name` behaves exactly as it does today for jobs saved before this change
10. Export round-trips through import with no loss; CSV is export-only
11. Snow, fence, materials and cut-outs are all unaffected
