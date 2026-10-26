# Foundation & Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fresh Seasonal Emote Replacer on a Cloudflare Worker with D1 holding the seeded Halloween and Winter presets, a public preset/stats API, the Stream Desk Deck design system, the landing page and the token guide, deployed to workers.dev.

**Architecture:** One Worker (`worker/`) serves the Vite-built SPA as static assets and answers `/api/*` with Hono over D1. Domain types and season logic live in `shared/` and are imported by both sides. The SPA (`src/`) is React with React Router; the design system (`src/design/`) is hand-authored CSS custom properties and CSS modules, no utility framework.

**Tech Stack:** Node ≥ 20, TypeScript 5, React 19, React Router 7, Vite 7 + `@cloudflare/vite-plugin`, Wrangler 4, Hono 4, Zod, Vitest 3 + `@cloudflare/vitest-pool-workers` (Worker tests) + jsdom and Testing Library (UI tests).

**Spec:** `docs/superpowers/specs/2026-10-27-seasonal-emote-replacer-rebuild.md`. Also read `GLOSSARY.md`, `PRODUCT.md` and `.impeccable/surfaces/src-pages-landing-tsx.md` (the landing's direction contract).

## Global Constraints

- English only. Voice: plain and friendly; errors say what happened and what to do.
- Product name: "Seasonal Emote Replacer". No 7TV logo or 7TV look-alike styling. The footer on every page says "Not affiliated with 7TV."
- Season IDs: `halloween`, `winter`. Labels: "Halloween", "Winter". Winter covers Christmas; there is no separate Christmas season.
- Owner credit: channel `niena`, linked to `https://twitch.tv/niena`.
- Numbers shown to visitors come only from `/api/stats`. Nothing is hard-coded or invented.
- Palette (from the direction contract): gunmetal `#3A3D42`, bone `#E6E1D6`, putty `#C9C3B5`, charcoal `#2A2A2A`, deep charcoal `#171A1E`, safety orange `#FF5F1F` (committing action only), amber `#FFB000` (live state only). Desk mat: putty in light mode, deep charcoal in dark mode.
- Depth from keycap travel and layered shadow, never glow or gradients.
- Fake token literal used everywhere a token is shown: `eyJhbGciOiJIUzI1NiJ9.EXAMPLE.NOT-A-REAL-TOKEN`.
- Emote images: `/emote-images/<id>.webp` first, falling back to `https://cdn.7tv.app/emote/<id>/2x.webp`.

## Review Focus

- **An emote image missing from the local cache** must fall back to the 7TV CDN, never a broken image (test in Task 4).
- **`/api/stats` failing or slow** must leave the landing fully usable, with counts hidden. Never "0", "NaN" or a spinner stuck in the amber screen (test in Task 5).
- **Keyboard-only and reduced-motion visitors** must be able to turn the season knob with the arrow keys, and see the seasonal state without the sequential flip (tests in Tasks 4 and 5).
- **An unknown season in the URL** (`/api/presets/easter`) returns 404 JSON, not a Worker exception (test in Task 3).
- **A visitor pressing MAKE SEASONAL with an empty channel field** gets focus moved to the field and an inline message, not navigation to an empty Replace page (test in Task 5).

---

## File Structure

```
wrangler.jsonc                Worker name, assets, D1 binding
vite.config.ts                react + cloudflare plugins
vitest.config.ts              jsdom project: src/, shared/, scripts/
vitest.worker.config.ts       workers pool project: worker/
tsconfig.json / tsconfig.app.json / tsconfig.worker.json / tsconfig.node.json
index.html
data/presets/halloween.json   normalised source mappings
data/presets/winter.json
scripts/seed.ts               buildSeedSql(): pure
scripts/seed.test.ts
scripts/build-seed.ts         CLI: data/presets → migrations/0002_seed.sql
migrations/0001_presets.sql
migrations/0002_seed.sql      generated
shared/seasons.ts             SEASONS, SeasonId, isSeasonId, seasonLabel, currentSeason
shared/seasons.test.ts
shared/types.ts               wire types
worker/index.ts               Hono app + export default
worker/env.ts                 Env
worker/routes/presets.ts
worker/routes/stats.ts
worker/test/setup.ts          applies D1 migrations
worker/test/api.test.ts
src/main.tsx, src/App.tsx     router
src/api.ts                    fetchStats, fetchPreset
src/lib/emote-image.ts        emoteImageUrl, emoteCdnUrl
src/design/tokens.css, src/design/fonts.css, src/design/fonts/*.woff2
src/design/Keycap.tsx|.module.css|.test.tsx
src/design/Knob.tsx|.module.css|.test.tsx
src/design/AmberScreen.tsx|.module.css
src/design/ActionKey.tsx|.module.css
src/design/DeckField.tsx|.module.css
src/design/SiteFooter.tsx
src/pages/Landing.tsx|.module.css|.test.tsx
src/pages/landing/*.tsx       sections below the first viewport
src/pages/TokenGuide.tsx|.module.css|.test.tsx
src/pages/token-guide/DevtoolsChrome.tsx, DevtoolsFirefox.tsx
src/pages/NotYet.tsx          placeholder for /replace and /compare
public/emote-images/          kept from main
```

---

### Task 1: Fresh branch and Worker scaffold

**Files:**
- Delete on the new branch: everything from `main` except `public/emote-images/`, `public/halloween-preset.json`, `public/winter-preset.json`, `.gitignore`
- Create: `package.json`, `wrangler.jsonc`, `vite.config.ts`, `vitest.config.ts`, `vitest.worker.config.ts`, the four `tsconfig*.json`, `index.html`, `worker/index.ts`, `worker/env.ts`, `worker/test/setup.ts`, `worker/test/api.test.ts`, `src/main.tsx`, `src/App.tsx`, `README.md`
- Carry over untracked: `GLOSSARY.md`, `PRODUCT.md`, `docs/`, `.impeccable/`

**Interfaces:**
- Produces: `Env { DB: D1Database; ASSETS: Fetcher }` in `worker/env.ts`; `app: Hono<{ Bindings: Env }>` exported from `worker/index.ts` with `export default app`; npm scripts `dev`, `build`, `test`, `typecheck`, `deploy`, `seed`, `db:migrate:local`, `db:migrate:remote`.

- [ ] **Step 1: Create the branch.** The untracked leftovers (`src/App.jsx`, `src/App.css`, `src/index.css`, `src/main.jsx`, `src/assets/`, `public/vite.svg`, `tailwind.config.js`, `vite.config.js`) collide with `main`'s tracked copies. All of them match `main` except `src/App.jsx`, a 526-line early version that is in no commit. Move all of them to `../emote-replacer-leftovers/`, outside the repo; don't delete them. Then `git switch -c rebuild main`. Expected: `git status` lists only the carried-over untracked docs.

- [ ] **Step 2: Remove the old app.** `git rm` everything except the kept paths listed above.

- [ ] **Step 3: Write `package.json` and configs.** `"type": "module"`, `"engines": { "node": ">=20" }`. `wrangler.jsonc`: `name: "seasonal-emote-replacer"`, `main: "worker/index.ts"`, `compatibility_date: "2026-10-01"`, `assets: { not_found_handling: "single-page-application", run_worker_first: ["/api/*"] }`, `d1_databases: [{ binding: "DB", database_name: "seasonal-emote-replacer", database_id: "local", migrations_dir: "migrations" }]`. `vitest.worker.config.ts` uses `defineWorkersConfig` with `readD1Migrations("migrations")` bound as `TEST_MIGRATIONS`; `worker/test/setup.ts` calls `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)`. `test` script: `vitest run && vitest run -c vitest.worker.config.ts`.

- [ ] **Step 4: Write the failing test** in `worker/test/api.test.ts`:

```ts
it('GET /api/health answers ok', async () => {
  const res = await SELF.fetch('https://x/api/health');
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});
```

- [ ] **Step 5: Run** `npx vitest run -c vitest.worker.config.ts`. Expected: FAIL (404 or no handler).

- [ ] **Step 6: Implement** the `/api/health` route in `worker/index.ts`, plus a JSON 404 for any other `/api/*` path: `{ error: "Not found" }`. `src/App.tsx` renders a router with `/` only (placeholder text for now).

- [ ] **Step 7: Verify.** `npm test` passes; `npm run typecheck` is clean; `npm run dev` serves the SPA at `/` and `{"ok":true}` at `/api/health`.

- [ ] **Step 8: Commit** with message `chore: fresh Worker + Vite scaffold`. Write a short `README.md` (what it is, `npm run dev`, `npm test`, link to the spec) in the same commit.

---

### Task 2: Seasons, preset data and D1 seed

**Files:**
- Create: `shared/seasons.ts`, `shared/seasons.test.ts`, `shared/types.ts`, `data/presets/halloween.json`, `data/presets/winter.json`, `scripts/seed.ts`, `scripts/seed.test.ts`, `scripts/build-seed.ts`, `migrations/0001_presets.sql`, `migrations/0002_seed.sql` (generated)
- Delete: `public/halloween-preset.json`, `public/winter-preset.json` (moved into `data/presets/`)

**Interfaces:**
- Produces:
  - `SEASONS: readonly ['halloween', 'winter']`, `type SeasonId`, `isSeasonId(v: unknown): v is SeasonId`, `seasonLabel(id: SeasonId): string`, `currentSeason(date: Date): SeasonId`
  - `interface MappingRow { originalId: string; replacementId: string }`
  - `interface PresetFile { season: SeasonId; mappings: MappingRow[] }`
  - `buildSeedSql(presets: PresetFile[]): string`
  - Table `mappings(id TEXT PK, season TEXT NOT NULL, original_id TEXT NOT NULL, replacement_id TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (season, original_id))`. `source` is `'seed'` here; later plans add `'review'` and `'manual'`.

- [ ] **Step 1: Write failing tests** in `shared/seasons.test.ts`:

```ts
it('labels seasons', () => expect(seasonLabel('winter')).toBe('Winter'));
it('rejects unknown ids', () => expect(isSeasonId('easter')).toBe(false));
it.each([
  ['2026-10-27', 'halloween'], ['2026-09-15', 'halloween'], ['2026-11-05', 'halloween'],
  ['2026-11-06', 'winter'], ['2027-01-15', 'winter'], ['2027-01-16', 'halloween'],
])('currentSeason(%s) is %s', (iso, season) => expect(currentSeason(new Date(iso))).toBe(season));
```

And in `scripts/seed.test.ts`:

```ts
const sql = buildSeedSql([{ season: 'halloween', mappings: [
  { originalId: 'A'.repeat(26), replacementId: 'B'.repeat(26) },
  { originalId: 'A'.repeat(26), replacementId: 'C'.repeat(26) },   // duplicate original: last wins
  { originalId: 'D'.repeat(26), replacementId: 'D'.repeat(26) },   // self-mapping: dropped
]}]);
it('keeps the last mapping per original', () => {
  expect(sql).toContain(`'${'C'.repeat(26)}'`);
  expect(sql).not.toContain(`'${'B'.repeat(26)}'`);
});
it('drops self-mappings', () => expect(sql).not.toContain(`'${'D'.repeat(26)}'`));
it('is idempotent', () => expect(sql).toContain('ON CONFLICT (season, original_id) DO NOTHING'));
it('rejects malformed ids', () => expect(() => buildSeedSql([{ season: 'winter',
  mappings: [{ originalId: "x'); DROP TABLE mappings;--", replacementId: 'B'.repeat(26) }] }])).toThrow());
```

- [ ] **Step 2: Run** `npx vitest run shared scripts`. Expected: FAIL (modules missing).

- [ ] **Step 3: Implement.** `currentSeason`: Sep 15 to Nov 5 is Halloween, Nov 6 to Jan 15 is Winter, otherwise Halloween. `buildSeedSql`: validate every ID against `/^[0-9A-Z]{26}$/` (throw on mismatch), dedupe by original (last wins), drop self-mappings, emit one `INSERT INTO mappings (id, season, original_id, replacement_id, source) VALUES … ON CONFLICT (season, original_id) DO NOTHING;` per season, with IDs `seed_<season>_<originalId>`. Write `migrations/0001_presets.sql` with the table above plus `CREATE INDEX idx_mappings_season ON mappings (season)`.

- [ ] **Step 4: Normalise the data.** Convert `public/halloween-preset.json` and `public/winter-preset.json` into `data/presets/<season>.json` as `PresetFile`, keeping only `originalId` and `replacementId`. The `name` field is a list label, not emote data. `scripts/build-seed.ts` reads both and writes `migrations/0002_seed.sql`, printing per-season counts.

- [ ] **Step 5: Verify.** `npx vitest run shared scripts` passes. `npm run seed` prints `halloween: 275` and `winter: 568`. `npm run db:migrate:local`, then `npx wrangler d1 execute seasonal-emote-replacer --local --command "SELECT season, COUNT(*) FROM mappings GROUP BY season"` returns 275 and 568.

- [ ] **Step 6: Commit** with message `feat: seasons, preset data and D1 seed`.

---

### Task 3: Public preset and stats API

**Files:**
- Create: `worker/routes/presets.ts`, `worker/routes/stats.ts`
- Modify: `worker/index.ts` (mount routes), `shared/types.ts`, `worker/test/api.test.ts`

**Interfaces:**
- Consumes: `isSeasonId`, `SEASONS` (Task 2); table `mappings`.
- Produces:
  - `GET /api/presets/:season` → `PresetResponse { season: SeasonId; mappings: MappingRow[] }`, ordered by `original_id`, with `Cache-Control: public, max-age=300`.
  - `GET /api/stats` → `StatsResponse { mappings: Record<SeasonId, number> }`, with the same cache header. Plan 3 adds `channelsCompared`.

- [ ] **Step 1: Write failing tests.**

```ts
it('serves a seeded preset', async () => {
  const res = await SELF.fetch('https://x/api/presets/halloween');
  const body = await res.json<PresetResponse>();
  expect(res.status).toBe(200);
  expect(body.mappings).toHaveLength(275);
  expect(res.headers.get('cache-control')).toBe('public, max-age=300');
});
it('404s an unknown season as JSON', async () => {
  const res = await SELF.fetch('https://x/api/presets/easter');
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: 'Unknown season' });
});
it('counts mappings per season', async () => {
  const res = await SELF.fetch('https://x/api/stats');
  expect(await res.json()).toEqual({ mappings: { halloween: 275, winter: 568 } });
});
```

The seed migration is applied by `worker/test/setup.ts`.

- [ ] **Step 2: Run** `npx vitest run -c vitest.worker.config.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both routes with prepared statements. Stats returns 0 for a season with no rows.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat: public preset and stats API`.

---

### Task 4: Design system: tokens, fonts and deck components

Load `/impeccable` before this task (the craft floor applies). Code-led build; the chosen sketch is `.impeccable/mocks/decision/challenger-hardware.html`, and the quality-bar images are in `.impeccable/mocks/quality-bar/`.

**Files:**
- Create: `src/design/tokens.css`, `src/design/fonts.css`, `src/design/fonts/` (self-hosted woff2: JetBrains Mono 500/700 for legends and readouts, Archivo variable with width axis for display), `Keycap`, `Knob`, `AmberScreen`, `ActionKey`, `DeckField`, `SiteFooter` (each `.tsx` + `.module.css`), `src/lib/emote-image.ts`, tests `src/design/Keycap.test.tsx`, `src/design/Knob.test.tsx`

**Interfaces:**
- Produces:
  - `emoteImageUrl(id: string): string` → `/emote-images/${id}.webp`; `emoteCdnUrl(id: string): string` → `https://cdn.7tv.app/emote/${id}/2x.webp`
  - `<Keycap emoteId: string; alt: string; legend?: string; state?: 'idle' | 'flipped' | 'unmapped'; pressed?: boolean />`. `unmapped` is shown with a dashed stroke, not a hue change.
  - `<Knob<T extends string> label: string; options: { value: T; label: string }[]; value: T; onChange(v: T): void />` with `role="radiogroup"`; each detent is `role="radio"`; ArrowRight/ArrowUp go to the next detent and ArrowLeft/ArrowDown to the previous, with no wrap; the knob rotates −60°/0°/+60° across three detents.
  - `<AmberScreen children />`: a `role="status"` live region (`aria-live="polite"`).
  - `<ActionKey type?: 'button' | 'submit'; children; onClick? />`: the safety-orange key. The only orange element on any page.
  - `<DeckField label: string; value; onChange; error?: string; inputRef? />`: a labelled input; `error` renders under it, wired with `aria-describedby`.
  - `<SiteFooter />`: "Not affiliated with 7TV." plus links to `/`, `/guide/token` and `https://twitch.tv/niena`.
  - CSS custom properties in `tokens.css`: `--gunmetal --bone --putty --charcoal --charcoal-deep --orange --amber --mat --ink --key-travel`, with dark mode under `prefers-color-scheme: dark` switching `--mat` and `--ink`.

- [ ] **Step 1: Write failing tests.**

```ts
// Keycap.test.tsx
it('falls back to the 7TV CDN when the cached image fails', () => {
  render(<Keycap emoteId={'A'.repeat(26)} alt="peepoHappy" />);
  const img = screen.getByAltText('peepoHappy');
  expect(img).toHaveAttribute('src', `/emote-images/${'A'.repeat(26)}.webp`);
  fireEvent.error(img);
  expect(img).toHaveAttribute('src', `https://cdn.7tv.app/emote/${'A'.repeat(26)}/2x.webp`);
});
// Knob.test.tsx
const opts = [{ value: 'normal', label: 'Normal' }, { value: 'halloween', label: 'Halloween' }, { value: 'winter', label: 'Winter' }];
it('moves one detent per arrow key without wrapping', async () => {
  const onChange = vi.fn();
  render(<Knob label="Season" options={opts} value="winter" onChange={onChange} />);
  await userEvent.type(screen.getByRole('radio', { name: 'Winter' }), '{ArrowRight}{ArrowLeft}');
  expect(onChange.mock.calls).toEqual([['halloween']]);
});
it('exposes the current detent', () => {
  render(<Knob label="Season" options={opts} value="halloween" onChange={() => {}} />);
  expect(screen.getByRole('radio', { name: 'Halloween' })).toBeChecked();
});
```

- [ ] **Step 2: Run** `npx vitest run src/design`. Expected: FAIL.
- [ ] **Step 3: Implement** the tokens, fonts and components following the craft floor. Keycap travel happens on `:active`, plus `pressed` for the programmatic flip. The knob uses a knurled face built from `repeating-conic-gradient` (the material, not decoration) and supports drag with full keyboard parity.
- [ ] **Step 4: Run** `npx vitest run src/design`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat: Stream Desk Deck design system`.

---

### Task 5: Landing page

Built under `/impeccable` against `.impeccable/surfaces/src-pages-landing-tsx.md`. Its FIRST VIEWPORT, signature interaction and FINISH lines are requirements.

**Files:**
- Create: `src/api.ts`, `src/pages/Landing.tsx`, `src/pages/Landing.module.css`, `src/pages/landing/HowItWorks.tsx`, `src/pages/landing/SafeByDefault.tsx`, `src/pages/landing/BuiltFromRealSets.tsx`, `src/pages/landing/MadeBy.tsx`, `src/pages/NotYet.tsx`, `src/pages/Landing.test.tsx`
- Modify: `src/App.tsx` (routes `/`, `/replace`, `/compare` → `NotYet`)

**Interfaces:**
- Consumes: `/api/stats`, `/api/presets/:season` (Task 3); `Keycap`, `Knob`, `AmberScreen`, `ActionKey`, `DeckField`, `SiteFooter` (Task 4); `currentSeason`, `seasonLabel` (Task 2).
- Produces: `fetchStats(signal?): Promise<StatsResponse>`, `fetchPreset(season, signal?): Promise<PresetResponse>`. The MAKE SEASONAL key navigates to `/replace?channel=<encoded>&season=<SeasonId>`, which Plan 2 consumes.

Behaviour the tests pin:
- The deck shows the first 24 mappings of the knob's season as keycaps with legends `1` to `24`. Knob detents are Normal, Halloween, Winter. The page loads on Normal and turns once to `currentSeason(today)` 800 ms after the preset has loaded.
- On a season change the keys flip from original to replacement art one at a time, in reading order, 60 ms apart. The amber screen shows `HALLOWEEN · 12/24` during the flip and `HALLOWEEN · 275 MAPPINGS` after it, using the live count. Under `prefers-reduced-motion: reduce` there is no auto-turn and no stagger: the keys switch together.
- If stats fail, the amber screen shows only the season name. If the preset fails, the keys show a dashed `unmapped` state and the rest of the page works.
- Headline, verbatim: "One key makes your set seasonal." Below the fold: How it works (token → pick your set → press the key; Undo any time), Safe by default (duplicate by default, preview, exact undo, the token stays in your browser), Built from real sets (comparisons, "two channels made the same swap → review", live counts, a link to `/compare`), Made by niena (`https://twitch.tv/niena`), then the footer.

- [ ] **Step 1: Write failing tests** in `src/pages/Landing.test.tsx`, mocking `fetch`:

```ts
it('stops an empty submit at the channel field', async () => {
  renderAt('/');
  await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));
  expect(screen.getByLabelText(/channel/i)).toHaveFocus();
  expect(screen.getByText('Type your channel name first.')).toBeInTheDocument();
  expect(currentPath()).toBe('/');
});
it('sends the channel and season to Replace', async () => {
  renderAt('/');
  await userEvent.type(screen.getByLabelText(/channel/i), 'niena');
  await userEvent.click(screen.getByRole('radio', { name: 'Winter' }));
  await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));
  expect(currentPath()).toBe('/replace?channel=niena&season=winter');
});
it('hides counts when stats fail', async () => {
  failFetch('/api/stats');
  renderAt('/');
  expect(await screen.findByRole('status')).not.toHaveTextContent(/\d|NaN/);
});
it('skips the auto-turn under reduced motion', async () => {
  mockReducedMotion(true);
  renderAt('/');
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(screen.getByRole('radio', { name: 'Normal' })).toBeChecked();
});
```

- [ ] **Step 2: Run** `npx vitest run src/pages/Landing`. Expected: FAIL.
- [ ] **Step 3: Build the first viewport** per the contract, then the sections below it, in the deck's material (no generic cards).
- [ ] **Step 4: Run** `npx vitest run src/pages/Landing`. Expected: PASS.
- [ ] **Step 5: Inspect.** One batched screenshot round at 1440 and 390 wide, in light and dark mode. Fix everything it shows in one batch and confirm with at most one more round.
- [ ] **Step 6: Commit** with message `feat: landing page`.

---

### Task 6: Token guide

**Files:**
- Create: `src/pages/TokenGuide.tsx`, `src/pages/TokenGuide.module.css`, `src/pages/token-guide/DevtoolsChrome.tsx`, `src/pages/token-guide/DevtoolsFirefox.tsx`, `src/pages/TokenGuide.test.tsx`
- Modify: `src/App.tsx` (route `/guide/token`)

**Interfaces:**
- Consumes: design components (Task 4).
- Produces: route `/guide/token`. Plan 2's token field links to it.

- [ ] **Step 1 (needs the owner, signed in to 7tv.app): Verify the storage key.** Open 7tv.app signed in, then DevTools → Application → Local Storage → `https://7tv.app` (Firefox: Storage). Record the exact key holding the token. The last known name is `7tv-token`. Everything below uses the recorded name. Do not copy the value anywhere.
- [ ] **Step 2: Write failing tests.**

```ts
it('only ever shows the fake token', () => {
  renderAt('/guide/token');
  expect(screen.getAllByText('eyJhbGciOiJIUzI1NiJ9.EXAMPLE.NOT-A-REAL-TOKEN').length).toBeGreaterThan(0);
});
it('switches between browser panels', async () => {
  renderAt('/guide/token');
  await userEvent.click(screen.getByRole('tab', { name: 'Firefox' }));
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Storage');
});
```

- [ ] **Step 3: Run** `npx vitest run src/pages/TokenGuide`. Expected: FAIL.
- [ ] **Step 4: Implement.** Numbered steps (sign in to 7tv.app → open DevTools with F12 → Application/Storage → Local Storage → copy the value of the recorded key). Each browser panel is a faithful HTML/CSS recreation of that browser's storage view, with the key row highlighted and the fake token as its value. They're marked `aria-hidden` with an equivalent text description beside them. Plain warning: "Anyone with this token can change your emote sets. Don't share it. This tool only ever sends it to 7TV."
- [ ] **Step 5: Run** `npx vitest run src/pages/TokenGuide`. Expected: PASS.
- [ ] **Step 6: Commit** with message `feat: token guide`.

---

### Task 7: Design finish and deploy

**Files:**
- Create: `DESIGN.md`, `.impeccable/design.json` (by the impeccable documenter)
- Modify: `wrangler.jsonc` (`database_id`), `README.md` (deploy section)

- [ ] **Step 1: Run the detector.** `"<impeccable>/scripts/impeccable" detect --json src` (the path is in the impeccable skill). Fix mechanical findings.
- [ ] **Step 2: Finish review.** Capture `.impeccable/review/desktop.png` (1440) and `mobile.png` (390) of `/` and `/guide/token`. Spawn `impeccable-finish-reviewer` with the direction contract, the screenshots, the detector output and the chosen sketch as the critique reference. Act on its disposition per the impeccable skill.
- [ ] **Step 3: Document.** Spawn `impeccable-documenter` to write `DESIGN.md` and `.impeccable/design.json` from the built world.
- [ ] **Step 4 (needs the owner): Cloudflare login.** The owner runs `! npx wrangler login` in the Claude Code prompt.
- [ ] **Step 5: Create the remote D1** with `npx wrangler d1 create seasonal-emote-replacer`, put the returned ID into `wrangler.jsonc`, then `npm run db:migrate:remote`.
- [ ] **Step 6: Deploy** with `npm run deploy`. Verify: `curl https://seasonal-emote-replacer.<account>.workers.dev/api/stats` returns `{"mappings":{"halloween":275,"winter":568}}`, and `/` and `/guide/token` render.
- [ ] **Step 7: Commit** with message `chore: design docs and first deploy`.
