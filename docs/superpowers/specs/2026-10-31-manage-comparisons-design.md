# Admins manage submitted comparisons

2026-10-31. Builds on `2026-10-27-seasonal-emote-replacer-rebuild.md` (Compare, Review).

## Why

A comparison's season can't be changed once it's submitted, and the same set pair is locked for 14 days, so a comparison filed under the wrong season (niena's Christmas set went in as Halloween because the picker defaults to Halloween until 6 November) can only be fixed by hand in D1. There is also no way to see who submitted what, or to get rid of everything one person sent if they keep submitting junk.

## Goals

- Admins see, on the Review page, every comparison grouped by the person who submitted it.
- Admins can move one comparison to another season.
- Admins can discard one comparison, or everything one person submitted, with or without blocking them from submitting again.
- Admins can see who is blocked and unblock them.

## Non-goals

- Adding or editing seasons in the browser. That is a separate project, to be discussed after this one (decided by niena). Seasons stay the fixed list in `shared/seasons.ts`.
- Letting submitters edit or delete their own comparisons.
- Blocking anyone from the rest of the site. A blocked person can still Replace, Revert and use Compare's preview.

## Anti-goals

- Touching accepted mappings. A mapping that's accepted stays accepted, whether or not the discarded comparisons contained it (decided by niena). Rejections stay too.
- Leaving orphaned sightings behind. Once a comparison is discarded, none of its sightings may count towards a candidate any more.
- A season change that moves the comparison but not its sightings, or the other way round.

## Words

- **Submitter**: the signed-in Twitch account that submitted a comparison. It's not the **Channel**: the channel is the owner of the normal set (`docs/adr/0001`), and one submitter can send comparisons for many channels. Add this to `GLOSSARY.md`.
- **Discard**: deleting a comparison and all its sightings.
- **Block**: a permanent record that a submitter may not submit comparisons, until an admin unblocks them.

## Data

New migration `0006_comparison_admin.sql`:

- `comparisons` gains `submitter_login`, `submitter_name`, `normal_set_name` and `seasonal_set_name` (all nullable TEXT; older rows have none).
- `comparisons` also gains `match_count` (INTEGER), backfilled once from `sightings` in the migration (my call). The list then never counts `sightings` on a page load, in keeping with commit `4ff980b`'s care about D1 row reads. A season change leaves the count as it is.
- Backfill `submitter_login` and `submitter_name` from `sessions` (the newest session with that `twitch_id`) where one exists. Rows with no session keep NULL, and the page shows the Twitch ID instead. The set names aren't backfilled (my call): older rows show the set IDs, linked to 7TV.
- New table `blocked_submitters`: `twitch_id` (primary key), `login`, `display_name`, `blocked_by` (admin's Twitch ID), `blocked_at`.

`POST /api/comparisons` stores the submitter's login and display name, both set names and the match count with every new or resubmitted comparison.

## Server

All under the existing `/api/admin` routes, so `requireAdmin` applies.

- **List**: returns every comparison grouped by submitter. Each submitter has their Twitch ID, login, display name, comparison count, total matches and latest submission time. Each comparison has its id, channel name, both set ids and names, season, match count (its sightings) and submitted time. Submitters are sorted by latest submission, newest first; comparisons within a submitter likewise.
- **Change season**: takes a comparison id and a season from `SEASONS`, and updates `comparisons.season` and every one of its `sightings.season` in one `db.batch`. It returns the updated comparison. Moving a comparison to the season it already has is a no-op.
- **Discard one**: deletes the comparison's sightings and the comparison in one batch. It deletes sightings explicitly rather than relying on `ON DELETE CASCADE` (my call). It returns how many sightings went.
- **Discard all for a submitter**: the same for every comparison with that `submitted_by`, in one batch, with an optional `block` flag. When blocking, it also inserts the `blocked_submitters` row in the same batch. It returns counts.
- **Blocked list** and **Unblock** (deletes the row).
- An admin (per `ADMIN_LOGINS`) can't be blocked (my call). Admins are listed by login but blocks go by Twitch ID, and older rows may have no login, or an outdated one after a rename. So:
  - Blocking refuses when the submitter's known login is an admin's. The block key is hidden on those cards.
  - Blocking goes ahead when the login is unknown, so people who submitted junk before this change and have since signed out can still be blocked.
  - As a safety net, `POST /api/comparisons` never refuses a signed-in admin, checked against the session's current login, even if their Twitch ID is in `blocked_submitters`.
- Batches must stay within D1's per-request query limit: one statement per table, not one per comparison (see the existing sightings insert in `worker/routes/comparisons.ts`).

`POST /api/comparisons` refuses a blocked submitter with 403 and a plain message: "You can't submit comparisons any more." It checks before fetching from 7TV. Preview stays open to them (my call).

Discarding frees the pair at once. The comparison row is gone, so the 14-day cooldown no longer applies, and anyone not blocked can submit that pair again straight away.

## Review page

A new **Comparisons** section, after "Waiting for review" and before "Broken emotes", visible to admins only.

- One card per submitter (layout A in the mockup, chosen by niena): their name (or Twitch ID) and their comparison and match counts. The card has **Discard all** and **Discard all & block** keys. Blocking always discards everything, so a blocked submitter never has a card; they appear in the Blocked list instead.
- Each card lists its comparisons: channel, normal set → seasonal set (names, or IDs, linked to 7TV), season, match count and date. Each has a **Season** knob and a **Discard** key.
- Cards beyond the first few start collapsed (my call; the exact number is left to the builder).
- The section lists every season at once, independent of the Season knob at the top of the page (my call), so a misfiled comparison is visible from either season.
- Every discard asks for confirmation first and says how many comparisons and matches will go (my call). There's no Undo for discards (my call): restoring could mean re-sending thousands of sightings. Changing a season needs no confirmation, since moving it back undoes it.
- After a season change or discard, the review queue and the section refresh, so candidates that lost their sightings drop out and moved ones appear under their new season. This follows the "decisions update the page instead of re-reading it" pattern from commit `4ff980b` where practical.
- A **Blocked** list, shown only when someone is blocked, lists each blocked submitter with when they were blocked and an **Unblock** key.

## Compare page

- A blocked submitter who submits sees the server's message in the existing error plate. Nothing else changes.

## Tests

Follow the existing split: worker tests in `worker/test` (for example a new `comparisons-admin.test.ts`) and page tests in `src/pages/Review.test.tsx`. These need covering:

- a season change moves the sightings, so the candidate leaves one season's queue and joins the other's
- discards remove sightings, and accepted mappings and rejections survive
- a blocked submitter gets 403 on submit and still gets preview
- an admin can't be blocked, and a signed-in admin can still submit even if their ID ended up blocked
- `match_count` matches the sightings after a submit, a resubmit and the backfill
- the backfill leaves rows without a session NULL

## Left to the builder

- Route paths and payload shapes, following `src/api.ts` and `shared/types.ts`.
- Whether grouping happens in SQL or in the Worker.
- Pagination, if the list gets too large for one response.
- Exact look of the cards, confirm step and Blocked list, within the existing design system (`src/design`, `.impeccable`).
- How many cards start expanded.
