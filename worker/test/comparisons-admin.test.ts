import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signIn } from './helpers';

const db = env.DB;

beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM sightings'),
    db.prepare('DELETE FROM comparisons'),
    db.prepare('DELETE FROM blocked_submitters'),
  ]);
});

afterEach(() => vi.unstubAllGlobals());

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
