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

## Data

The Halloween and Winter mappings live in `data/presets/<season>.json` and seed D1 through `migrations/0002_seed.sql`. After editing a preset file, run `npm run seed` to regenerate the migration. Once deployed, D1 is the source of truth.

## Deploy

One-time setup:

```bash
npx wrangler login
npx wrangler d1 create seasonal-emote-replacer   # put the printed database_id into wrangler.jsonc
npm run db:migrate:remote
```

Then, for every release:

```bash
npm run deploy
```

The app is served from `https://seasonal-emote-replacer.<your-account>.workers.dev`.
