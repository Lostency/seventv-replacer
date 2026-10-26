# Seasonal Emote Replacer: rebuild spec

Decisions from the 2026-10-26/27 grilling and design sessions. Vocabulary follows `GLOSSARY.md`; product truth lives in `PRODUCT.md`; the counting rule is `docs/adr/0001-channel-is-normal-set-owner.md`; the landing direction is `.impeccable/surfaces/src-pages-landing-tsx.md`.

## Foundation

- Fresh build on a new branch `rebuild` off `main`. Nothing is ported from the July 2026 rewrite on `dev` (it stays in history). Carried over: the mappings (`main:public/halloween-preset.json`, 275; `main:public/winter-preset.json`, 568) and `public/emote-images/` (1375 cached webp files).
- Stack: React + TypeScript + Vite; one Cloudflare Worker serving static assets and `/api`; D1 (free tier); Twitch OAuth.
- Deploy to `*.workers.dev`. niena.net is being retired.
- English only. Voice: plain and friendly.
- One preset per season. Seasons now: Halloween, Winter (Winter covers Christmas/xmas).

## Roles

- Anonymous: Landing, token guide, Replace (needs only a 7TV token kept in the browser).
- User (signed in with Twitch): Compare.
- Admin (Twitch login on an allowlist in config): Review and preset editing.

## Landing

- Explains what the tool does and how to use it. The first viewport follows the Stream Desk Deck direction contract.
- Proof: live counts from D1 (mappings per season, channels compared) and the owner's channel, niena (twitch.tv/niena). Nothing invented.
- Footer: "Not affiliated with 7TV". No 7TV logo.
- Token guide: step by step, with recreated Chrome/Edge and Firefox DevTools panels (HTML/CSS) showing an obviously fake token, the row to copy highlighted.

## Set picker (shared by Replace and Compare)

- Enter a channel name to list that channel's 7TV sets, or paste a 7TV set URL. The two can be mixed.
- In Compare, the normal side and the seasonal side are picked independently and may come from different channels.

## Replace

- Modes: duplicate + replace (default; new set named "<set name> (<Season>)", editable), replace in place, revert (preset applied seasonal → normal).
- Picking replace in place shows: "This changes your set directly. Revert uses the <Season> preset in reverse and may not restore every emote exactly. Undo restores it exactly, but only from this browser."
- Preview before every run: current and seasonal image side by side per emote, all ticked, untickable; emotes without a seasonal version are summarised in one line ("41 emotes have no Halloween version yet").
- Each swap keeps the emote's alias. Aliases outside `[A-Za-z0-9_-]` are transliterated (ä→ae, ö→oe, ü→ue, ß→ss) and retried once; renames are listed in the run report.
- Swaps are paced and retried with backoff when rate-limited; if the ADD half of a swap fails, the original is put back.
- If 7TV refuses to create a set (creation unavailable or the account has used its slots), say so and suggest creating an empty set on 7TV and choosing it as the target.
- Undo: the last 10 runs, stored in the browser (survives reload). Undo re-reads the set first; emotes changed since the run are skipped and listed. Undoing a duplicate + replace deletes the created set if 7TV allows it, else tells the user to delete it.

## Compare

- Signed-in users only. Pick a normal set and a seasonal set, label the season (required).
- The browser sends only the two set IDs, the season and the unticked pairs. The server fetches both sets from 7TV itself.
- Matching: same alias (case-insensitive) in both sets and a different emote ID is a sighting. Same emote ID: not a sighting. Emotes only in one set: ignored.
- The user sees the matches, all ticked, and can untick before submitting.
- Cooldown: the exact same pair (normal set ID + seasonal set ID) can be compared again 14 days after its last submission. Compare shows "Compared on <date>, can be compared again from <date>". Other pairs from the same channel are not affected.
- A recomparison replaces that comparison's sightings; other comparisons keep theirs.
- The channel of a comparison is the 7TV owner of the normal set (ADR 0001).

## Candidates and review

- A pairing (season, original, replacement) is a candidate once sightings come from at least 2 distinct channels, unless it is already a mapping in that season's preset or has been rejected. A channel counts once per pairing however many of its comparisons show it. The threshold is adjustable in the admin view.
- Sightings of pairings already in the preset are recorded but don't go into the queue.
- A pending candidate that drops below the threshold leaves the queue until it reaches it again. Accepted mappings are never removed automatically.
- Review card: the two emote images side by side, Accept and Reject, and one line "<alias> → <alias> · seen in N channels". If the original is already mapped to something else, the card shows the current mapping and Accept becomes "Replace existing".
- Rejections are permanent. A short Undo toast follows each decision.
- Admin can also add a mapping by pasting two 7TV emote links, delete a mapping (deleting doesn't reject it), and download a preset as JSON. D1 is the source of truth once seeded.

## Delivery order

1. **Foundation & Landing** (`docs/superpowers/plans/2026-10-27-foundation-and-landing.md`): scaffold, D1 + seed, public preset/stats API, design system, landing page, token guide, first deploy.
2. **Replace**: 7TV client, set picker, preview, run engine, undo.
3. **Accounts, Compare & Review**: Twitch OAuth, sessions, roles, comparison and sighting storage, candidate rule, review queue, preset editing.

Each plan is written once the previous one is merged, so it can build on what actually shipped.
