import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AdminComparisonsResponse,
  ApiError,
  ComparisonMoved,
  ComparisonsDiscarded,
  ReviewResponse,
} from '../../shared/types';
import { call, signIn } from './helpers';

const db = env.DB;
let admin: string;

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  call(path, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const list = async () => (await send('GET', '/api/admin/comparisons', admin)).json<AdminComparisonsResponse>();
const queue = async (season: string) =>
  (await (await send('GET', `/api/admin/review/${season}`, admin)).json<ReviewResponse>()).candidates;

interface Seed {
  by: string;
  login?: string | null;
  name?: string | null;
  season?: string;
  channel?: string;
  at?: string;
  sightings?: Array<[string, string]>;
}

/** One comparison with the columns migration 0006 added, and its sightings. */
async function seed(id: string, { by, login = null, name = null, season = 'halloween', channel = `CH-${id}`, at = '2026-10-27T12:00:00Z', sightings = [] }: Seed) {
  await db.batch([
    db
      .prepare(
        `INSERT INTO comparisons (id, normal_set_id, seasonal_set_id, season, channel_id, channel_name, submitted_by, submitted_at,
                                  submitter_login, submitter_name, normal_set_name, seasonal_set_name, match_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, `N-${id}`, `S-${id}`, season, channel, channel, by, at, login, name, `Normal ${id}`, `Seasonal ${id}`, sightings.length),
    ...sightings.map(([o, r]) =>
      db
        .prepare('INSERT INTO sightings (comparison_id, season, original_id, replacement_id, alias, channel_id) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, season, o, r, `alias-${o}`, channel),
    ),
  ]);
}

beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM sightings'),
    db.prepare('DELETE FROM comparisons'),
    db.prepare('DELETE FROM blocked_submitters'),
    db.prepare('DELETE FROM rejections'),
    db.prepare('DELETE FROM settings'),
    db.prepare("DELETE FROM mappings WHERE original_id LIKE 'O%'"),
  ]);
  admin = await signIn('niena');
});

afterEach(() => vi.unstubAllGlobals());

describe('admin comparisons', () => {
  it('lists comparisons grouped by submitter, newest submitter first', async () => {
    await seed('C1', { by: 'T1', login: 'niena', name: 'Niena', at: '2026-10-20T12:00:00Z', sightings: [['O1', 'R1']] });
    await seed('C2', { by: 'T1', login: 'niena', name: 'Niena', at: '2026-10-25T12:00:00Z', sightings: [['O2', 'R2'], ['O3', 'R3']] });
    await seed('C3', { by: 'T2', login: 'spammer', name: 'Spammer', at: '2026-10-30T12:00:00Z', sightings: [['O4', 'R4']] });

    const res = await send('GET', '/api/admin/comparisons', admin);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json<AdminComparisonsResponse>();
    expect(body.blocked).toEqual([]);
    expect(body.submitters.map((s) => s.twitchId)).toEqual(['T2', 'T1']);
    const [spammer, niena] = body.submitters;
    expect(spammer).toMatchObject({ login: 'spammer', displayName: 'Spammer', admin: false, matches: 1, latest: '2026-10-30T12:00:00Z' });
    expect(niena).toMatchObject({ login: 'niena', displayName: 'Niena', admin: true, matches: 3 });
    expect(niena!.comparisons.map((c) => c.id)).toEqual(['C2', 'C1']);
    expect(niena!.comparisons[0]).toEqual({
      id: 'C2',
      channelName: 'CH-C2',
      normalSetId: 'N-C2',
      normalSetName: 'Normal C2',
      seasonalSetId: 'S-C2',
      seasonalSetName: 'Seasonal C2',
      season: 'halloween',
      matches: 2,
      submittedAt: '2026-10-25T12:00:00Z',
    });
  });

  it('turns away non-admins', async () => {
    const viewer = await signIn('viewer');
    expect((await send('GET', '/api/admin/comparisons', viewer)).status).toBe(403);
    expect((await send('PUT', '/api/admin/comparisons/C1/season', viewer, { season: 'winter' })).status).toBe(403);
    expect((await send('DELETE', '/api/admin/comparisons/C1', viewer)).status).toBe(403);
  });

  it('moving a comparison moves its sightings, so the candidate changes season', async () => {
    await seed('C1', { by: 'T2', channel: 'CH1', sightings: [['O1', 'R1']] });
    await seed('C2', { by: 'T2', channel: 'CH2', sightings: [['O1', 'R1']] });
    expect(await queue('halloween')).toHaveLength(1);

    const res = await send('PUT', '/api/admin/comparisons/C1/season', admin, { season: 'winter' });
    expect(res.status).toBe(200);
    expect((await res.json<ComparisonMoved>()).comparison).toMatchObject({ id: 'C1', season: 'winter', matches: 1 });
    await send('PUT', '/api/admin/comparisons/C2/season', admin, { season: 'winter' });

    expect(await queue('halloween')).toEqual([]);
    expect(await queue('winter')).toMatchObject([{ originalId: 'O1', replacementId: 'R1', channels: 2 }]);
  });

  it('moving refuses an unknown season and answers 404 for an unknown id', async () => {
    await seed('C1', { by: 'T2' });
    const bad = await send('PUT', '/api/admin/comparisons/C1/season', admin, { season: 'easter' });
    expect(bad.status).toBe(400);
    expect(await bad.json<ApiError>()).toEqual({ error: 'Pick a season, then try again.' });
    const gone = await send('PUT', '/api/admin/comparisons/NOPE/season', admin, { season: 'winter' });
    expect(gone.status).toBe(404);
    expect(await gone.json<ApiError>()).toEqual({ error: 'That comparison is gone.' });
  });

  it('discarding drops candidates that lose their sightings, and keeps mappings and rejections', async () => {
    await seed('C1', { by: 'T2', channel: 'CH1', sightings: [['O1', 'R1']] });
    await seed('C2', { by: 'T3', channel: 'CH2', sightings: [['O1', 'R1']] });
    await db.batch([
      db.prepare("INSERT INTO mappings (id, season, original_id, replacement_id, source) VALUES ('M-O2', 'halloween', 'O2', 'R2', 'review')"),
      db.prepare("INSERT INTO rejections (season, original_id, replacement_id, rejected_by) VALUES ('halloween', 'O3', 'R3', 'T1')"),
    ]);

    const res = await send('DELETE', '/api/admin/comparisons/C1', admin);
    expect(res.status).toBe(200);
    expect(await res.json<ComparisonsDiscarded>()).toEqual({ comparisons: 1, matches: 1, blocked: null });
    expect(await queue('halloween')).toEqual([]);
    expect((await db.prepare("SELECT COUNT(*) AS n FROM sightings WHERE comparison_id = 'C1'").first<{ n: number }>())!.n).toBe(0);
    expect(await db.prepare("SELECT 1 FROM mappings WHERE original_id = 'O2'").first()).not.toBeNull();
    expect(await db.prepare("SELECT 1 FROM rejections WHERE original_id = 'O3'").first()).not.toBeNull();
  });

  it('discards everything one submitter sent, leaving others alone', async () => {
    await seed('C1', { by: 'T2', login: 'spammer', sightings: [['O1', 'R1']] });
    await seed('C2', { by: 'T2', login: 'spammer', sightings: [['O2', 'R2'], ['O3', 'R3']] });
    await seed('C3', { by: 'T2', login: 'spammer', sightings: [['O4', 'R4']] });
    await seed('C4', { by: 'T1', login: 'niena', sightings: [['O5', 'R5']] });

    const res = await send('POST', '/api/admin/submitters/T2/discard', admin, { block: false });
    expect(res.status).toBe(200);
    expect(await res.json<ComparisonsDiscarded>()).toEqual({ comparisons: 3, matches: 4, blocked: null });
    const left = await db.prepare('SELECT comparison_id AS id FROM sightings').all();
    expect(left.results).toEqual([{ id: 'C4' }]);
    expect((await list()).submitters.map((s) => s.twitchId)).toEqual(['T1']);
    expect(await db.prepare('SELECT 1 FROM blocked_submitters').first()).toBeNull();
  });

  it('discard and block records the block with the submitter’s newest name', async () => {
    await seed('C1', { by: 'T2', login: 'oldname', name: 'OldName', at: '2026-10-20T12:00:00Z' });
    await seed('C2', { by: 'T2', login: 'spammer', name: 'Spammer', at: '2026-10-30T12:00:00Z' });

    const res = await send('POST', '/api/admin/submitters/T2/discard', admin, { block: true });
    expect(res.status).toBe(200);
    expect(await res.json<ComparisonsDiscarded>()).toEqual({
      comparisons: 2,
      matches: 0,
      blocked: { twitchId: 'T2', login: 'spammer', displayName: 'Spammer', blockedAt: expect.any(String) },
    });
    const after = await list();
    expect(after.submitters).toEqual([]);
    expect(after.blocked).toMatchObject([{ twitchId: 'T2', login: 'spammer' }]);
  });

  it('refuses to block an admin, but discarding their comparisons is fine', async () => {
    await seed('C1', { by: 'T1', login: 'niena' });
    const refused = await send('POST', '/api/admin/submitters/T1/discard', admin, { block: true });
    expect(refused.status).toBe(403);
    expect(await refused.json<ApiError>()).toEqual({ error: 'Admins can’t be blocked.' });
    expect(await db.prepare("SELECT 1 FROM comparisons WHERE id = 'C1'").first()).not.toBeNull();
    expect((await send('POST', '/api/admin/submitters/T1/discard', admin, { block: false })).status).toBe(200);
  });

  it('blocks a submitter whose login is unknown', async () => {
    await seed('C1', { by: 'T9' });
    const res = await send('POST', '/api/admin/submitters/T9/discard', admin, { block: true });
    expect(res.status).toBe(200);
    expect(await db.prepare('SELECT login, display_name AS name FROM blocked_submitters').first()).toEqual({ login: null, name: null });
  });

  it('discarding a submitter with nothing left answers 404', async () => {
    const res = await send('POST', '/api/admin/submitters/T2/discard', admin, { block: true });
    expect(res.status).toBe(404);
    expect(await res.json<ApiError>()).toEqual({ error: 'Nothing to discard.' });
    expect(await db.prepare('SELECT 1 FROM blocked_submitters').first()).toBeNull();
  });

  it('a block that loses a race with another discard says so instead of reporting success', async () => {
    await seed('C1', { by: 'T2', login: 'spammer', name: 'Spammer' });
    // Another admin's discard lands between this request's checks and its writes.
    const realBatch = db.batch.bind(db);
    vi.spyOn(db, 'batch').mockImplementationOnce(async (statements) => {
      await db.prepare("DELETE FROM comparisons WHERE submitted_by = 'T2'").run();
      return realBatch(statements);
    });
    const res = await send('POST', '/api/admin/submitters/T2/discard', admin, { block: true });
    expect(res.status).toBe(404);
    expect(await res.json<ApiError>()).toEqual({ error: 'Nothing to discard.' });
    expect(await db.prepare('SELECT 1 FROM blocked_submitters').first()).toBeNull();
  });

  it('unblocking removes the block', async () => {
    await db.prepare("INSERT INTO blocked_submitters (twitch_id, login, display_name, blocked_by) VALUES ('T2', 'spammer', 'Spammer', 'T1')").run();
    const res = await send('DELETE', '/api/admin/blocked/T2', admin);
    expect(res.status).toBe(204);
    expect((await list()).blocked).toEqual([]);
  });

  it('discarding an unknown id answers 404', async () => {
    const res = await send('DELETE', '/api/admin/comparisons/NOPE', admin);
    expect(res.status).toBe(404);
    expect(await res.json<ApiError>()).toEqual({ error: 'That comparison is gone.' });
  });
});

describe('migration 0006', () => {
  it('the backfill names submitters from their newest session and counts matches, leaving unknowns NULL', async () => {
    await db.prepare('DELETE FROM sessions').run();
    await signIn('niena'); // a session for Twitch ID T1
    const insert = (id: string, by: string) =>
      db
        .prepare(
          `INSERT INTO comparisons (id, normal_set_id, seasonal_set_id, season, channel_id, channel_name, submitted_by, submitted_at)
           VALUES (?, ?, ?, 'halloween', 'C1', 'C1', ?, '2026-10-27T12:00:00Z')`,
        )
        .bind(id, `N-${id}`, `S-${id}`, by);
    const sighting = (id: string, o: string) =>
      db
        .prepare("INSERT INTO sightings (comparison_id, season, original_id, replacement_id, alias, channel_id) VALUES (?, 'halloween', ?, 'R', 'a', 'C1')")
        .bind(id, o);
    await db.batch([insert('CMP-A', 'T1'), insert('CMP-B', 'T9'), sighting('CMP-A', 'O1'), sighting('CMP-A', 'O2'), sighting('CMP-B', 'O1')]);

    const migration = env.TEST_MIGRATIONS.find((m) => m.name.startsWith('0006'))!;
    for (const query of migration.queries.filter((q) => /^\s*UPDATE/i.test(q))) await db.prepare(query).run();

    const { results } = await db
      .prepare('SELECT id, submitter_login AS login, submitter_name AS name, match_count AS matches FROM comparisons ORDER BY id')
      .all();
    expect(results).toEqual([
      { id: 'CMP-A', login: 'niena', name: 'niena', matches: 2 },
      { id: 'CMP-B', login: null, name: null, matches: 1 },
    ]);
  });
});
