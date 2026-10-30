# Seasonal Emote Replacer

Swap the emotes in a 7TV emote set for their seasonal variants (Halloween, Winter) in bulk, and undo it exactly afterwards. The mapping data grows by comparing channels' own normal and seasonal sets. Not affiliated with 7TV.

What is being built and why: [the rebuild spec](docs/superpowers/specs/2026-10-27-seasonal-emote-replacer-rebuild.md). Vocabulary: [GLOSSARY.md](GLOSSARY.md).

## Develop

```bash
npm install
npm run dev        # SPA and /api on one Vite dev server (Worker runs in workerd)
npm test           # UI and pure tests (jsdom), then Worker tests (workerd)
npm run typecheck
```

Compare needs Twitch sign-in. For local work, copy `.dev.vars.example` to `.dev.vars` and fill in a Twitch application's client ID and secret (create one at <https://dev.twitch.tv/console/apps> with the redirect URL `http://localhost:5173/api/auth/callback`). Without them, Compare says sign-in isn't set up and everything else works.

## Data

The Halloween and Winter mappings live in `data/presets/<season>.json` and seed D1 through `migrations/0002_seed.sql`. After editing a preset file, run `npm run seed` to regenerate the migration. Once deployed, D1 is the source of truth.

## Deploy

One-time setup:

```bash
npx wrangler login
npx wrangler d1 create seasonal-emote-replacer   # put the printed database_id into wrangler.jsonc
npm run db:migrate:remote
npx wrangler secret put TWITCH_CLIENT_ID
npx wrangler secret put TWITCH_CLIENT_SECRET
```

The Twitch application needs `https://7tv.niena.tv/api/auth/callback` as a redirect URL (and the workers.dev address's, to sign in there). Admins are the Twitch logins in `ADMIN_LOGINS` (`wrangler.jsonc`). They review candidates and edit the presets at `/review`; Compare links there once they're signed in.

Then, for every release (run `npm run db:migrate:remote` first whenever `migrations/` has a new file):

```bash
npm run deploy
```

This deploys the Worker `seventv-replacer-new`, which serves `https://7tv.niena.tv` (and `https://seventv-replacer-new.<your-account>.workers.dev`).
