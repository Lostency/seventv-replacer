# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + TypeScript + Vite, served by one Cloudflare Worker with static assets and an `/api` backend; Cloudflare D1 for storage; Twitch OAuth for sign-in. Deployed to a `*.workers.dev` URL (the old niena.net deployment is being retired). Fresh build: nothing is carried over from earlier versions except the existing Halloween and Winter mappings and the cached emote images.

## Users

- **Streamers and their mods** who use 7TV emotes on Twitch and want their channel's emote set to go seasonal (Halloween, Winter) without swapping dozens of emotes by hand, then back again afterwards. Often doing this right before a stream or at the start of a season, sometimes as an editor on someone else's channel.
- **Contributors**: signed-in users who compare a channel's normal set with its seasonal set to feed the shared mapping dataset.
- **The admin** (the owner): reviews candidates and curates each season's preset.

## Product Purpose

Swap the emotes in a 7TV emote set for their seasonal variants in bulk, and grow the list of known normal → seasonal swaps by learning from sets channels have already built by hand. Success: a streamer gets a seasonal set in minutes, can safely get back to where they were, and the presets keep getting better without the admin searching emotes one by one.

## Positioning

The mappings are not guessed from search results. They come from real channels' own normal and seasonal sets, counted across distinct channels and approved by a human before anyone else uses them.

## Operating Context

- 7TV has no third-party OAuth: changing a set needs the user's 7TV token, copied by hand from 7tv.app's browser storage. The token stays in the browser and is only ever sent to 7TV.
- 7TV rate-limits requests. It accepts most alias spellings (umlauts, accents, `&`, `.`, `*` all work, confirmed 2026-10-27) but refuses some characters, such as `,`.
- A run happens in the browser tab, one emote per request, because the token never leaves the browser. Closing the tab stops the run.
- Emote sets may be owned by a different 7TV account than the channel that uses them (editors).

## Capabilities and Constraints

Terminology follows `GLOSSARY.md`; the counting rule is recorded in `docs/adr/0001-channel-is-normal-set-owner.md`.

- **Landing** (no account): what the tool does, how to use it, a step-by-step token guide with recreated Chrome/Edge and Firefox DevTools illustrations that use an obviously fake token.
- **Replace** (7TV token only, no account): pick a set by channel name or by pasting a set URL. Modes: duplicate + replace (default), replace in place (with a warning that revert may not be exact), revert (preset backwards). Side-by-side preview with tick boxes before running. Undo for the last 10 runs, stored in the browser, which skips emotes changed since the run.
- **Compare** (Twitch sign-in): pick a normal set and a seasonal set independently (channel or URL), label the season, review the alias matches (same alias, different emote ID), untick any, submit. The server fetches both sets itself. The same two sets can be compared again after 14 days, replacing that comparison's sightings.
- **Review** (admin): candidates appear once 2 distinct channels agree, unless already mapped or rejected. Side-by-side cards with Accept / Reject and a "seen in N channels" line; "Replace existing" when the original is already mapped. Rejections are permanent. Short undo after each decision. Manual add/delete of mappings and JSON export.
- English only.
- The landing page names and links the owner's Twitch channel: niena (twitch.tv/niena).

## Brand Commitments

- Name: **Seasonal Emote Replacer**. Describes itself as a tool *for* 7TV, with a plain "not affiliated with 7TV" note; no 7TV logo or look-alike branding.
- Voice: plain and friendly. Clear and short, a little warm, the occasional Twitch reference. Error messages say what happened and what to do next. Serious steps (tokens, replacing in place) stay strictly clear.

## Evidence on Hand

- Live counts from the database are the only numbers shown (mappings per season, channels compared). Nothing is hard-coded or invented.
- The owner's own channel, niena (twitch.tv/niena), is named and linked.
- Existing data: Halloween preset (~275 mappings) and Winter preset in `public/presets/`, cached emote images in `public/emote-images/`.
- No testimonials, user counts, or press exist; none may be fabricated.

## Product Principles

1. **Never leave a set worse than you found it.** A safe default (duplicate), an exact undo, a preview before every run, and rollback when a swap fails.
2. **Evidence before inclusion.** Nothing reaches a preset without sightings from distinct channels and a human decision.
3. **No account needed to get value.** Swapping your own set needs only the 7TV token; signing in is for contributing.
4. **The token is the user's.** It never leaves the browser except to go to 7TV, and the guide never shows a real one.
