# Replace runs that never stop for one emote

2026-10-28. Builds on `2026-10-27-seasonal-emote-replacer-rebuild.md` (Replace, Review) and replaces its rule "if 7TV refuses a name, the run pauses and asks the user".

## Why

A replace run can take 15 minutes. Today one refused name opens the rename dialog and the whole run waits until someone answers, so a run left in a background tab stands still. Emotes whose seasonal version is deleted or broken on 7TV are handled (the normal emote goes back in) but the user only hears about it in the report at the end, and nobody tells the admins that the mapping is broken.

## Goals

- A run never waits for the user. Every emote that causes a problem is set aside, and the run carries on with the rest.
- The user hears about each problem the moment it happens, and can fix it right then (while the run keeps going) or at the end.
- Problems are saved in the browser and stay until they are fixed or dismissed, across reloads and later visits.
- Deleted or broken emotes reach the admins on the review page, in their own section, with enough detail to see what happened.

## Non-goals

- Running after the tab is closed. Everything stays in the browser with the user's own token (decided by niena). A background tab keeps running, possibly slower because browsers throttle background timers.
- Changing how swaps are paced, batched or retried for rate limits.
- Changing the automatic resend of refused ß, umlaut and accented names; that still happens first.

## Anti-goals

- A set that ends up short. Whenever a seasonal emote can't go in, the normal one is used instead (put back in place, or copied into the duplicate), exactly as today (confirmed by niena).
- A fix or a retry that Undo doesn't know about.
- Problems that silently disappear without being fixed or dismissed.

## The run

- `askAlias` no longer blocks. When 7TV refuses an emote after the automatic resend, the run:
  1. uses the normal emote instead (as today),
  2. records a **problem** for that emote,
  3. moves on to the next emote.
- The rename dialog (`RenameDialog`) and its "skip every later refusal" option go away.
- The time-left estimate no longer needs to subtract time spent waiting on the user.

## Problems

Three kinds, each tied to one emote in one set:

| Kind | When | Fix |
|------|------|-----|
| **Name refused** | 7TV refused the seasonal emote's name; the normal emote is in the set instead. | Type a new name: the swap is retried (remove the normal emote, add the seasonal one under the new name). |
| **Broken emote** | The seasonal emote is deleted or unusable on 7TV; the normal emote is in the set instead. | None for the user: dismiss it. It is reported to the admins (below). |
| **Missing** | Neither the seasonal nor the normal emote would go in; the set is short this emote (today's `lost`). | Type a name: the normal emote is added under it. |

**Telling a broken emote from a refused name:** when an add is refused, look the emote up on 7TV. If 7TV says it doesn't exist or can't be used, it's a broken emote. Otherwise it's a refused name. If the lookup itself fails, treat it as a refused name (my call): the user can still retry or dismiss it. In revert mode the emote going in is the normal one, so a deleted normal emote is also a broken emote.

An emote that a duplicate only copies unchanged and that 7TV refuses is a **missing** problem.

**Live feedback:** each new problem shows at once as a short notice (announced politely to screen readers), and appears in a **Problems** list on the Replace page while the run continues.

**Fixing:**
- Each name-refused or missing problem has a name field, pre-filled with the existing alias suggestion (`suggestAlias`), and a Retry key. Each problem can be dismissed.
- A fix made while a run is going is queued and applied by the run between batches, so writes never overlap and the pacing still holds. A fix made with no run going is applied straight away.
- A retry that 7TV refuses again keeps the problem, with 7TV's new message.
- Before retrying, check that the set still has the emote the fix expects (the normal one for a name-refused problem, none for a missing one). If the set changed, say so and keep the problem.
- A successful fix joins the run's Undo record, so Undo reverses it with everything else. It also shows in the run report's renamed list.

**Saving:** problems are kept in `localStorage` next to the runs (`ser.problems`), with what's needed to fix them without the run: set id and name, season, mode, run id, the normal and seasonal emote ids, the alias, the kind, 7TV's message and when it happened. A problem is removed only when its fix works or the user dismisses it. Undoing a run removes that run's problems. Storage may be blocked (private window): then problems last as long as the page, like the runs do.

**Where it shows:** the Problems list sits on the Replace page and is visible whenever any are saved, also on a later visit before a new run, grouped by set. Fixing needs the 7TV token like any run.

## Admins: broken emotes

- When the run finds a broken emote, the browser reports it: `POST /api/broken-emotes` with season, normal emote id, seasonal emote id and 7TV's message. No sign-in needed, since Replace doesn't need one.
- The Worker only stores a report for a pairing that is in that season's preset, and checks with 7TV itself that the emote really is gone or unusable. Reports are deduplicated per pairing: one row holding a count, first seen, last seen and the latest message. New table, new migration (`0005_broken_emotes.sql`).
- The review page gets a **Broken emotes** section, separate from the review queue. Each entry shows the normal and the seasonal emote (both linked to 7TV), which side broke, 7TV's message, how many times it was reported and when it was first and last seen.
- Actions: **Replace** the seasonal emote (paste a 7TV link, as in Add a mapping), **Delete** the mapping, or **Dismiss** the report. Changing or deleting the mapping clears its report. Undo works as elsewhere on the page.
- A broken mapping stays in the preset until an admin acts (my call): reports never change the preset on their own.

## Left to the builder

- The exact 7TV lookup and how its answers map to "doesn't exist / can't be used".
- How the queue of in-run fixes hands over to the run between batches.
- The notice's look and how long it stays, within the existing design system (`src/design`, `UndoToast` as a model).
- Layout of the Problems list and the Broken emotes section.
- A cap on saved problems if one is needed.
- Rate limiting of `POST /api/broken-emotes` beyond the preset and 7TV checks.

## Calls made without niena

- Broken-emote reports are anonymous, accepted only for pairings in the preset and confirmed with 7TV.
- Reports never pull a mapping out of the preset automatically.
- Fixes during a run are queued between batches rather than sent at once.
- A successful fix joins the original run's Undo record.
- Undoing a run clears that run's problems.
