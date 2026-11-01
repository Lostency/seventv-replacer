# Admins Manage Submitted Comparisons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins see every comparison on the Review page grouped by submitter. They can move a comparison to another season, discard one, or discard everything a submitter sent, optionally blocking them.

**Architecture:** A D1 migration adds submitter and set names, a stored match count and a `blocked_submitters` table. A new Hono router, mounted inside the existing `admin` router so `requireAdmin` runs once, serves the list, season-move, discard and unblock endpoints. `POST /api/comparisons` records the new columns and refuses blocked submitters. A self-contained `Comparisons` component on the Review page fetches the list, updates it in place after each action, and asks the page to re-read only the review queue.

**Tech Stack:** Cloudflare Workers + D1, Hono, zod, React 19, Vitest (`@cloudflare/vitest-plugin` for the Worker, Testing Library for pages).

**Spec:** `docs/superpowers/specs/2026-10-31-manage-comparisons-design.md`

## Global Constraints

- Seasons stay the fixed `SEASONS` list in `shared/seasons.ts`; validate with `z.enum(SEASONS)`.
- Accepted mappings and rejections are never touched by any new endpoint.
- Every multi-statement write is one `db.batch`, with one statement per table, never one per comparison (D1 caps queries per request).
- All new admin responses send `Cache-Control: no-store` (the `NO_STORE` constant in `worker/routes/admin.ts`).
- User-facing copy uses curly apostrophes (’), as elsewhere in the codebase.
- Blocked-submit message, exactly: `You can’t submit comparisons any more.` (status 403).
- Refusing to block an admin, exactly: `Admins can’t be blocked.` (status 403).
- "Submitter" is the signed-in account that submitted; "Channel" is the normal set's owner. Don't mix them in names or copy.

## Review Focus

1. **A season change while the page shows the other season's queue.** The queue for the season on screen must refresh, so moved candidates leave or arrive. Covered by the Task 4 test `moving a comparison re-reads only the review queue`.
2. **Discarding a submitter whose comparisons are the only sightings behind a candidate.** The candidate must leave the queue. Covered by the Task 2 test `discarding drops candidates that lose their sightings`.
3. **A rename since the backfill.** A stored admin login that's outdated must not stop an admin from submitting. Covered by the Task 3 test `a signed-in admin can submit even when their ID is blocked`.
4. **Blocking someone with no comparisons left** (double-click, two admin tabs). The answer must be 404 `Nothing to discard.` and must not insert a block row with empty names. Covered by the Task 3 test `discarding a submitter with nothing left answers 404`.
5. **Old rows with NULL names and set names.** The page must show the Twitch ID and set IDs without crashing. Covered by the Task 4 test `shows the Twitch ID and set IDs when names are missing`.

---

### Task 1: Store submitter, set names and match count

**Files:**
- Create: `migrations/0006_comparison_admin.sql`
- Modify: `worker/routes/comparisons.ts:106-126`
- Modify: `GLOSSARY.md` (add **Submitter**, **Discard**, **Block** under "Discovering mappings", with the definitions in the spec's "Words" section)
- Test: `worker/test/comparisons.test.ts`, new `worker/test/comparisons-admin.test.ts`

**Interfaces:**
- Produces: columns `comparisons.submitter_login TEXT`, `submitter_name TEXT`, `normal_set_name TEXT`, `seasonal_set_name TEXT` (all nullable) and `match_count INTEGER NOT NULL DEFAULT 0`. Table `blocked_submitters (twitch_id TEXT PRIMARY KEY, login TEXT, display_name TEXT, blocked_by TEXT NOT NULL, blocked_at TEXT NOT NULL DEFAULT (datetime('now')))`.

- [ ] **Step 1: Write the failing tests**

In `worker/test/comparisons.test.ts`:

```ts
it('records who submitted, both set names and the match count', async () => {
  await post('/api/comparisons', cookie, { normalSetId: NORMAL, seasonalSetId: SEASONAL, season: 'halloween', excluded: [{ originalId: 'B', replacementId: 'B2' }] });
  const row = await env.DB.prepare('SELECT submitter_login AS login, submitter_name AS name, normal_set_name AS n, seasonal_set_name AS s, match_count AS m FROM comparisons').first();
  expect(row).toEqual({ login: 'viewer', name: 'viewer', n: 'Set N01', s: 'Set S01', m: 1 });
});
```

Also extend `holds the same pair for 14 days, then replaces its sightings`: after the resubmit at line 95, assert that `match_count` equals the number of sightings rows (2).

In the new `worker/test/comparisons-admin.test.ts` (it uses the same `beforeEach` clearing pattern as `admin.test.ts`, with `blocked_submitters` added):

```ts
it('the backfill names submitters from their newest session and counts matches, leaving unknowns NULL', async () => {
  // signIn('niena') created a session for twitch id T1 (twitchHandlers default id)
  // insert comparisons CMP-A (submitted_by 'T1', 2 sightings) and CMP-B (submitted_by 'T9', no session, 1 sighting) with NULL new columns
  const migration = env.TEST_MIGRATIONS.find((m) => m.name.startsWith('0006'))!;
  for (const q of migration.queries.filter((q) => /^\s*UPDATE/i.test(q))) await env.DB.prepare(q).run();
  // expect CMP-A: submitter_login 'niena', submitter_name 'niena', match_count 2
  // expect CMP-B: submitter_login null, submitter_name null, match_count 1
});
```

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `npx vitest run -c vitest.worker.config.ts worker/test/comparisons.test.ts worker/test/comparisons-admin.test.ts`
Expected: FAIL. The new columns don't exist, and `migration` is undefined.

- [ ] **Step 3: Write `migrations/0006_comparison_admin.sql`**

The migration has five `ALTER TABLE comparisons ADD COLUMN` statements, then two backfill `UPDATE`s:
- `submitter_login` and `submitter_name` come from a correlated subquery on `sessions` where `twitch_id = comparisons.submitted_by`, `ORDER BY created_at DESC LIMIT 1`.
- `match_count` is `(SELECT COUNT(*) FROM sightings WHERE comparison_id = comparisons.id)`.

Then `CREATE TABLE blocked_submitters` as in Interfaces. Each `UPDATE` must start its own statement, so the test's `/^\s*UPDATE/` filter finds it. Lead with a comment in the style of `0005`.

- [ ] **Step 4: Record the new columns in `POST /api/comparisons`**

Add the five columns to the `INSERT` and its `ON CONFLICT ... DO UPDATE SET` list. Bind them to `user.login`, `user.displayName`, `pair.normal.name`, `pair.seasonal.name` and `matches.length`.

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `npx vitest run -c vitest.worker.config.ts`
Expected: PASS, the whole Worker suite.

- [ ] **Step 6: Commit**

```bash
git add migrations/0006_comparison_admin.sql worker/routes/comparisons.ts worker/test/comparisons.test.ts worker/test/comparisons-admin.test.ts GLOSSARY.md
git commit -m "feat: comparisons record who submitted them and how many matches they hold"
```

### Task 2: List, move and discard comparisons

**Files:**
- Create: `worker/routes/comparisons-admin.ts`
- Modify: `worker/routes/admin.ts` (add `admin.route('/', comparisonsAdmin)` after `admin.use('*', requireAdmin)`)
- Modify: `shared/types.ts` (add the types below, after `DecisionRequest`)
- Test: `worker/test/comparisons-admin.test.ts`

**Interfaces:**
- Consumes: Task 1's columns.
- Produces, in `shared/types.ts`:

```ts
export interface AdminComparison {
  id: string;
  channelName: string;
  normalSetId: string;
  normalSetName: string | null;
  seasonalSetId: string;
  seasonalSetName: string | null;
  season: SeasonId;
  matches: number;
  submittedAt: string;
}

/** Everything one submitter sent, newest first. `admin` hides the block key. */
export interface SubmitterGroup {
  twitchId: string;
  login: string | null;
  displayName: string | null;
  admin: boolean;
  matches: number;
  latest: string;
  comparisons: AdminComparison[];
}

export interface BlockedSubmitter {
  twitchId: string;
  login: string | null;
  displayName: string | null;
  blockedAt: string;
}

export interface AdminComparisonsResponse {
  submitters: SubmitterGroup[];
  blocked: BlockedSubmitter[];
}

export interface ComparisonMoved {
  comparison: AdminComparison;
}

export interface ComparisonsDiscarded {
  comparisons: number;
  matches: number;
  blocked: BlockedSubmitter | null;
}
```

- Routes (paths under `/api/admin`):
  - `GET /comparisons` returns `AdminComparisonsResponse`.
  - `PUT /comparisons/:id/season` with body `{ season }` returns `ComparisonMoved`.
  - `DELETE /comparisons/:id` returns `ComparisonsDiscarded` with `blocked: null`.
- The router exports `comparisonsAdmin = new Hono<AppEnv>()` and adds no middleware of its own.

- [ ] **Step 1: Write the failing tests** in `worker/test/comparisons-admin.test.ts`

Add a helper `seed(id, { by, login, name, season, sightings: Array<[o, r, channel]>, at })` that inserts a comparison with the Task 1 columns filled in, `match_count` = number of sightings, and those sightings.

- `lists comparisons grouped by submitter, newest submitter first`. Seed `T1` (login `niena`, two comparisons) and `T2` (login `spammer`, one newer comparison). Expect `submitters.map(s => s.twitchId)` to be `['T2', 'T1']`, T1's `comparisons` newest first, T1's `matches` the sum, `admin` true for `niena` and false for `spammer`, and `blocked: []`.
- `turns away non-admins`. `signIn('viewer')` gets 403 on all three routes.
- `moving a comparison moves its sightings, so the candidate changes season`. Seed two channels' Halloween comparisons showing O1 → R1. Move one of them to `winter` and the other too. Expect `GET /api/admin/review/halloween` to have no candidates and `/review/winter` to have O1 → R1. Expect the response's `comparison.season` to be `'winter'`.
- `moving refuses an unknown season and answers 404 for an unknown id`. These give 400 `Pick a season, then try again.` and 404 `That comparison is gone.`
- `discarding drops candidates that lose their sightings, and keeps mappings and rejections`. Seed the two-channel O1 → R1 candidate, plus a mapping `O2 → R2` and a rejection `O3 → R3` in Halloween. `DELETE` one comparison. Expect `{ comparisons: 1, matches: 1, blocked: null }`, an empty Halloween queue (threshold 2), no sightings rows for that id, and the mapping and rejection still present.
- `discarding an unknown id answers 404`. The message is `That comparison is gone.`

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `npx vitest run -c vitest.worker.config.ts worker/test/comparisons-admin.test.ts`
Expected: FAIL with 404 `Not found` from `app.notFound`.

- [ ] **Step 3: Implement the routes in `worker/routes/comparisons-admin.ts`**

- **List:** one `SELECT` over `comparisons`, ordered `submitted_at DESC`, plus one over `blocked_submitters`, in a single `db.batch`. Group in the Worker. A group's `login` and `displayName` are the newest non-null values among its rows, and `admin` is `login !== null && isAdmin(c.env, login)`. Since the rows are newest first, groups come out in order of first appearance. Order `blocked` by `blocked_at DESC`.
- **Move:** in one batch, `UPDATE comparisons SET season = ? WHERE id = ? RETURNING <columns>` and `UPDATE sightings SET season = ? WHERE comparison_id = ?`. No row returned means 404.
- **Discard one:** in one batch, `SELECT match_count FROM comparisons WHERE id = ?`, `DELETE FROM sightings WHERE comparison_id = ?` and `DELETE FROM comparisons WHERE id = ?`. An empty `SELECT` means 404.

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run -c vitest.worker.config.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/routes/comparisons-admin.ts worker/routes/admin.ts shared/types.ts worker/test/comparisons-admin.test.ts
git commit -m "feat: admins list comparisons by submitter, move them between seasons and discard them"
```

### Task 3: Discard everything from a submitter, block and unblock

**Files:**
- Modify: `worker/routes/comparisons-admin.ts`
- Modify: `worker/routes/comparisons.ts` (the blocked check in `POST /`)
- Test: `worker/test/comparisons-admin.test.ts`, `worker/test/comparisons.test.ts`

**Interfaces:**
- Consumes: `ComparisonsDiscarded`, `BlockedSubmitter` (Task 2); `isAdmin(env, login)` from `worker/session.ts`.
- Produces:
  - `POST /api/admin/submitters/:twitchId/discard` with body `{ block: boolean }` returns `ComparisonsDiscarded`.
  - `DELETE /api/admin/blocked/:twitchId` returns 204.

- [ ] **Step 1: Write the failing tests**

In `comparisons-admin.test.ts`:
- `discards everything one submitter sent, leaving others alone`. Seed T2 with three comparisons and T1 with one, then POST `{ block: false }` for T2. Expect `{ comparisons: 3, matches: <sum>, blocked: null }`, no T2 comparisons or sightings left, T1 untouched, and `blocked_submitters` empty.
- `discard and block records the block with the submitter's newest name`. With `{ block: true }`, expect `blocked` to be `{ twitchId: 'T2', login: 'spammer', displayName: 'Spammer', blockedAt: expect.any(String) }`, and the next `GET /comparisons` to list T2 under `blocked` but not under `submitters`.
- `refuses to block an admin, but discarding their comparisons is fine`. For a T1 seeded with login `niena`, `{ block: true }` answers 403 `Admins can’t be blocked.` and deletes nothing. `{ block: false }` answers 200.
- `blocks a submitter whose login is unknown`. A T9 seeded with NULL login and name gets `{ block: true }`, answers 200, and the row's `login` and `display_name` are null.
- `discarding a submitter with nothing left answers 404`. The message is `Nothing to discard.`, and nothing is inserted into `blocked_submitters`.
- `unblocking removes the block`. DELETE gives 204 and `blocked: []`.

In `comparisons.test.ts`:
- `refuses a blocked submitter before asking 7TV, but still previews`. Insert `blocked_submitters` row `('T1', 'viewer', 'viewer', 'X')`. Submit answers 403 with `{ error: 'You can’t submit comparisons any more.' }`, and the outbound fetch mock received no `7tv.io` call during the submit. Preview answers 200.
- `a signed-in admin can submit even when their ID is blocked`. `signIn('niena')` (Twitch id T1), block T1, and expect submit to give 201.
- `discarding frees the pair for an immediate resubmit`. Submit, then submit again and get 409. An admin `DELETE`s that comparison, and a third submit gives 201.

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `npx vitest run -c vitest.worker.config.ts worker/test/comparisons-admin.test.ts worker/test/comparisons.test.ts`
Expected: FAIL. The new routes give 404, and blocked submits give 201.

- [ ] **Step 3: Implement discard-all and unblock**

- First read the newest non-null `submitter_login` and the counts, `COUNT(*)` and `SUM(match_count)`, for `submitted_by = ?`. A count of 0 means 404. With `block`, a login that `isAdmin` matches means 403.
- Then run one batch, in this order:
  1. When blocking: `INSERT OR REPLACE INTO blocked_submitters (twitch_id, login, display_name, blocked_by) SELECT submitted_by, submitter_login, submitter_name, ? FROM comparisons WHERE submitted_by = ? ORDER BY submitted_at DESC LIMIT 1 RETURNING ...`. It runs before the deletes so its `SELECT` still sees the rows.
  2. `DELETE FROM sightings WHERE comparison_id IN (SELECT id FROM comparisons WHERE submitted_by = ?)`
  3. `DELETE FROM comparisons WHERE submitted_by = ?`
- `blocked_by` is `c.get('user').twitchId`.

- [ ] **Step 4: Refuse blocked submitters in `POST /api/comparisons`**

The check goes right after `submitBody` parses, before `existing()` and `loadPair()`. When `!isAdmin(c.env, user.login)` and a `blocked_submitters` row exists for `user.twitchId`, return 403 with the exact message. Move `const user = c.get('user')` up to make that possible.

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `npx vitest run -c vitest.worker.config.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add worker/routes/comparisons-admin.ts worker/routes/comparisons.ts worker/test/comparisons-admin.test.ts worker/test/comparisons.test.ts
git commit -m "feat: admins discard everything one submitter sent, and can block them from submitting"
```

### Task 4: Comparisons section on the Review page

**Files:**
- Create: `src/pages/review/Comparisons.tsx`
- Modify: `src/api.ts` (five calls below)
- Modify: `src/pages/Review.tsx` (new `queueVersion` state, plus the new section between "Waiting for review" and "Broken emotes")
- Modify: `src/pages/review/review.module.css` (submitter card and comparison row styles, reusing `.card`, `.actions`, `.line`)
- Test: `src/pages/Review.test.tsx` (new `describe('Review: comparisons')`, plus a `/api/admin/comparisons` and `/api/admin/submitters/` and `/api/admin/blocked/` handler in `adminServer`)

**Interfaces:**
- Consumes: Task 2 and Task 3 routes and types.
- Produces in `src/api.ts`:
  - `fetchAdminComparisons(): Promise<AdminComparisonsResponse>`
  - `moveComparison(id: string, season: SeasonId): Promise<ComparisonMoved>`
  - `discardComparison(id: string): Promise<ComparisonsDiscarded>`
  - `discardSubmitter(twitchId: string, block: boolean): Promise<ComparisonsDiscarded>`
  - `unblockSubmitter(twitchId: string): Promise<void>`
  
  All of them use `sendJson` and `encodeURIComponent` on path ids.
- Produces: `Comparisons({ onChanged, onProblem }: { onChanged(): void; onProblem(message: string): void })`. The component loads its own data once on mount and updates it in place after each action. `onChanged` tells the page to re-read the queue.

- [ ] **Step 1: Write the failing tests** in `src/pages/Review.test.tsx`

- `lists comparisons by submitter, with channel, sets, season, matches and date`. Expect a region "Comparisons" holding a card for "spammer" with "1 comparison · 88 matches", the channel name, and both set names linked to `https://7tv.app/emote-sets/<id>`.
- `shows the Twitch ID and set IDs when names are missing`. Expect `Twitch ID T9` and the set IDs as link text.
- `moving a comparison re-reads only the review queue`. Turn that row's Season knob to Winter. Expect a `PUT /api/admin/comparisons/C1/season` with `{ season: 'winter' }`, one more read of `/api/admin/review/`, and no new read of `/api/admin/mappings/`, `/api/admin/broken/` or `/api/admin/comparisons`.
- `discarding one comparison asks first, then takes it off without reading the list again`. Click Discard. The confirm says `Discard 1 comparison and 88 matches?`. Cancel sends nothing. Discard, then Discard again (the confirm key), sends `DELETE /api/admin/comparisons/C1`. The row is gone, the card's counts drop, and a card left empty disappears.
- `discard all & block moves the submitter to the Blocked list`. The confirm says `Discard 41 comparisons and 3,902 matches, and block spammer?`. After confirming, the card is gone, and a "Blocked" list shows spammer with an Unblock key. Unblock sends `DELETE /api/admin/blocked/T2` and empties the list.
- `hides the block key on an admin's card`. A group with `admin: true` has "Discard all" but no "Discard all & block".
- `says when a discard fails, and reads the list again`. A 500 on DELETE shows the server's message in the page's alert plate and causes one more `GET /api/admin/comparisons`.

- [ ] **Step 2: Run the tests to make sure they fail**

Run: `npx vitest run src/pages/Review.test.tsx`
Expected: FAIL, because there's no "Comparisons" region.

- [ ] **Step 3: Add the five calls to `src/api.ts`**

- [ ] **Step 4: Build `src/pages/review/Comparisons.tsx`**

- Use the loading and failed handling and copy pattern of `BrokenEmotes.tsx`. The copy is `Loading comparisons…` and `Comparisons didn’t load. Reload the page to try again.`
- When there are no submitters, show `No one has submitted a comparison yet.`
- Each card's heading is the submitter's `displayName ?? login ?? `Twitch ID ${twitchId}``, with counts below it, written `${n} comparison(s) · ${m} match(es)` using `toLocaleString('en')`.
- The first 3 cards start expanded. The others show a text button `Show ${n} comparisons`.
- Each row shows the channel, then `normal → seasonal` as links (the set name, or the ID when the name is null), the season, `${m} match(es)` and the date.
- Each row has a `Knob<SeasonId>` labelled `Season for ${channelName}` and a small `GunmetalKey` Discard.
- The confirm works inline, like `ReplaceForm`: the actions row is replaced by the question, a `GunmetalKey` Discard and a `textButton` Cancel. The copy is exactly:
  - one: `Discard 1 comparison and ${m} matches?`
  - all: `Discard ${n} comparisons and ${m} matches?`
  - all & block: `Discard ${n} comparisons and ${m} matches, and block ${name}?`
  
  Use singular and plural forms throughout, as the `plural` helper in `Compare.tsx` does.
- After a successful action, update local state:
  - **Move:** replace the comparison with the returned one.
  - **Discard one:** remove it and reduce the group's `matches`, and drop the group if it's empty.
  - **Discard all:** drop the group, and prepend `blocked` when it isn't null.
  - **Unblock:** remove it from the list.
  
  Then call `onChanged()`. On failure, call `onProblem(message)` and re-fetch the list.
- The "Blocked" list shows only when `blocked.length > 0`. Each entry shows the name, `blocked ${date}` and an Unblock key.

- [ ] **Step 5: Wire it into `src/pages/Review.tsx`**

- Add `const [queueVersion, setQueueVersion] = useState(0)` and include it in the queue effect's dependency list. It must not go into `usePreset`'s `version`.
- Render the section with heading `Comparisons` (id `comparisons-heading`).
- The lede reads: `Every submitted comparison, by who sent it. Move one to another season, or discard what shouldn’t count. Accepted mappings stay as they are.`
- Render `<Comparisons onChanged={() => setQueueVersion((v) => v + 1)} onProblem={setProblem} />`.

- [ ] **Step 6: Run the tests to make sure they pass**

Run: `npm test`
Expected: PASS, both suites. Then run `npm run typecheck`. Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/api.ts src/pages/review/Comparisons.tsx src/pages/review/review.module.css src/pages/Review.tsx src/pages/Review.test.tsx
git commit -m "feat: review page shows comparisons by submitter, with season moves, discards and blocks"
```
