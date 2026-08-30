# Bootprint — walkthrough video shot list

**Written:** 2026-08-29
**Plan:** record one ~4 minute walkthrough, then cut a ~40 second promo out of it.
The long one teaches the crew and buyers. The short one goes on the Play listing.

---

## Before you press record

- [ ] **Do Not Disturb on.** A text banner sliding across the screen recording is
      the single most common thing that forces a reshoot.
- [ ] **Battery above 60%.** GPS, map tiles and screen recording together drain
      hard, and a low-battery warning is another banner.
- [ ] **Pick a site you are free to show.** The recording will contain a real
      address and real aerial imagery. Your own yard or a commercial lot you
      control is safe. A customer's house is not — that is their property on
      screen, and it ends up on a public store listing.
- [ ] **Clear saved sites you don't want visible** if any customer names are in
      the list.
- [ ] Screen recording set to the highest quality the S25 offers.

A note on shape: the app is portrait-locked, so the screen recording is
vertical. That is correct for the app and fine for Shorts. The Play listing
video is normally 16:9, so the short cut gets the phone screen placed on a
background rather than stretched — I handle that in the edit.

---

## Part 1 — screen recording (phone, on its own)

Do this in one continuous take if you can. Mistakes are fine; I cut them out.
Talk while you do it, even roughly — I can use it or replace it later.

| # | What to do on screen | Roughly what to say | ~Time |
|---|---|---|---|
| 1 | Home screen, tap the Bootprint icon | "This is the whole thing." | 3s |
| 2 | Let it open and centre on you | "It opens where you're standing." | 5s |
| 3 | Tap each corner of the lot on the imagery | "Tap the corners. You can also walk them if there's no good picture." | 25s |
| 4 | Close the shape | "Close it up." | 5s |
| 5 | Let the area read out | "There's your square footage." | 10s |
| 6 | Switch to snow | "Same shape, snow numbers — how much you're moving, where it goes." | 30s |
| 7 | Switch to fence | "Same shape again, post count and footage." | 25s |
| 8 | Save and name the site | "Save it. It's there next time." | 10s |
| 9 | Export / share the result | "Send it to yourself or to the office." | 15s |

**The one shot that sells it:** #3 into #5. Going from tapping corners to a real
number is the whole product. Take that stretch slowly and don't rush the taps.

---

## Part 2 — outside footage (second camera, landscape)

Short, silent clips. These exist to prove it works on a real job, which is what
another contractor is actually judging.

- [ ] **Wide** — you walking a lot with the phone in hand (10s)
- [ ] **Over the shoulder** — screen visible, thumb tapping corners (8s)
- [ ] **Detail** — boots on gravel, or the truck in frame (5s)
- [ ] **You to camera, one take, one line** — what it does and who it's for (10s)

Shoot the wide and over-the-shoulder at the same lot you screen-recorded, so the
two halves cut together.

---

## What happens after

Hand me the files and I'll assemble both cuts with ffmpeg. Two things I need to
know before I encode:

1. Whether the recordings contain anything you don't want public — an address, a
   customer name in a saved site, a face.
2. Whether the long cut is going on YouTube, or staying internal for the crew.

The encode does **not** strip GPS metadata by default, so if these are going
public I strip location out of the source clips first.
