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
