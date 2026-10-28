import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminMappingsResponse, MappingDeleted, MappingWritten, ReviewResponse } from '../../shared/types';
import { call, signIn } from './helpers';

const db = env.DB;
let admin: string;

const send = (method: string, path: string, cookie: string, body?: unknown) =>
  call(path, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const review = async (cookie = admin) => (await send('GET', '/api/admin/review/halloween', cookie)).json<ReviewResponse>();

/** Two channels showing O1 → R1 in Halloween: one card in the queue. */
async function twoChannelsSaw(o = 'O1', r = 'R1') {
  for (const channel of ['C1', 'C2']) {
    const id = `CMP-${channel}-${o}`;
    await db.batch([
      db
        .prepare(
          `INSERT INTO comparisons (id, normal_set_id, seasonal_set_id, season, channel_id, channel_name, submitted_by, submitted_at)
           VALUES (?, ?, ?, 'halloween', ?, ?, 'T1', '2026-10-27T12:00:00Z')`,
        )
        .bind(id, `N${id}`, `S${id}`, channel, channel),
      db
        .prepare("INSERT INTO sightings (comparison_id, season, original_id, replacement_id, alias, channel_id) VALUES (?, 'halloween', ?, ?, 'peepoHappy', ?)")
        .bind(id, o, r, channel),
    ]);
  }
}

beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM sightings'),
    db.prepare('DELETE FROM comparisons'),
    db.prepare('DELETE FROM rejections'),
    db.prepare('DELETE FROM settings'),
    db.prepare("DELETE FROM mappings WHERE original_id LIKE 'O%'"),
  ]);
  admin = await signIn('niena');
});

afterEach(() => vi.unstubAllGlobals());

describe('admin API', () => {
  it('turns away visitors and non-admins', async () => {
    expect((await send('GET', '/api/admin/review/halloween', '')).status).toBe(401);
    const viewer = await signIn('viewer', {});
    const res = await send('GET', '/api/admin/review/halloween', viewer);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Review is for admins.' });
    expect((await send('PUT', '/api/admin/mappings', viewer, { season: 'halloween', originalId: 'O1', replacementId: 'R1', source: 'manual' })).status).toBe(403);
  });

  it('lists the queue with the threshold', async () => {
    await twoChannelsSaw();
    const res = await send('GET', '/api/admin/review/halloween', admin);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      season: 'halloween',
      threshold: 2,
      candidates: [{ originalId: 'O1', replacementId: 'R1', alias: 'peepoHappy', channels: 2, current: null }],
    });
  });

  it('accepting adds the mapping and empties the card', async () => {
    await twoChannelsSaw();
    const res = await send('PUT', '/api/admin/mappings', admin, { season: 'halloween', originalId: 'O1', replacementId: 'R1', source: 'review' });
    expect(res.status).toBe(200);
    expect(await res.json<MappingWritten>()).toEqual({ previous: null });
    expect((await review()).candidates).toEqual([]);
  });

  it('replacing an existing mapping returns what it replaced, so Undo can put it back', async () => {
    await db.prepare("INSERT INTO mappings (id, season, original_id, replacement_id, source) VALUES ('M-O1', 'halloween', 'O1', 'RX', 'seed')").run();
    const res = await send('PUT', '/api/admin/mappings', admin, { season: 'halloween', originalId: 'O1', replacementId: 'R1', source: 'review' });
    const { previous } = await res.json<MappingWritten>();
    expect(previous).toMatchObject({ originalId: 'O1', replacementId: 'RX', source: 'seed' });

    await send('PUT', '/api/admin/mappings', admin, { season: 'halloween', ...previous });
    const { mappings } = await (await send('GET', '/api/admin/mappings/halloween', admin)).json<AdminMappingsResponse>();
    expect(mappings.find((m) => m.originalId === 'O1')).toMatchObject({ replacementId: 'RX', source: 'seed' });
  });

  it('refuses the same emote on both sides', async () => {
    const res = await send('PUT', '/api/admin/mappings', admin, { season: 'halloween', originalId: 'O1', replacementId: 'O1', source: 'manual' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Pick two different emotes.' });
  });

  it('rejects permanently, and undoing a rejection brings the card back', async () => {
    await twoChannelsSaw();
    const rejected = await send('POST', '/api/admin/rejections', admin, { season: 'halloween', originalId: 'O1', replacementId: 'R1' });
    expect(rejected.status).toBe(201);
    expect((await review()).candidates).toEqual([]);

    expect((await send('DELETE', '/api/admin/rejections/halloween/O1/R1', admin)).status).toBe(204);
    expect((await review()).candidates).toMatchObject([{ originalId: 'O1', replacementId: 'R1' }]);
  });

  it('deletes a mapping and returns it', async () => {
    await send('PUT', '/api/admin/mappings', admin, { season: 'halloween', originalId: 'O1', replacementId: 'R1', source: 'manual' });
    const first = await (await send('DELETE', '/api/admin/mappings/halloween/O1', admin)).json<MappingDeleted>();
    expect(first.deleted).toMatchObject({ originalId: 'O1', replacementId: 'R1', source: 'manual' });
    const again = await (await send('DELETE', '/api/admin/mappings/halloween/O1', admin)).json<MappingDeleted>();
    expect(again).toEqual({ deleted: null });
  });

  it('lists a season’s mappings with their source, sorted', async () => {
    await send('PUT', '/api/admin/mappings', admin, { season: 'halloween', originalId: 'O2', replacementId: 'R2', source: 'manual' });
    await send('PUT', '/api/admin/mappings', admin, { season: 'halloween', originalId: 'O1', replacementId: 'R1', source: 'review' });
    const res = await send('GET', '/api/admin/mappings/halloween', admin);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const { mappings } = await res.json<AdminMappingsResponse>();
    const ours = mappings.filter((m) => m.originalId.startsWith('O'));
    expect(ours.map((m) => [m.originalId, m.replacementId, m.source])).toEqual([
      ['O1', 'R1', 'review'],
      ['O2', 'R2', 'manual'],
    ]);
    const ids = mappings.map((m) => m.originalId);
    expect(ids).toEqual([...ids].sort());
  });

  it('stores the threshold within 1 to 50', async () => {
    const res = await send('PUT', '/api/admin/threshold', admin, { threshold: 3 });
    expect(await res.json()).toEqual({ threshold: 3 });
    expect((await review()).threshold).toBe(3);
    expect((await send('PUT', '/api/admin/threshold', admin, { threshold: 0 })).status).toBe(400);
    expect((await send('PUT', '/api/admin/threshold', admin, { threshold: 2.5 })).status).toBe(400);
    expect((await send('PUT', '/api/admin/threshold', admin, { threshold: 51 })).status).toBe(400);
  });

  it('answers 404 for an unknown season', async () => {
    const res = await send('GET', '/api/admin/review/easter', admin);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Unknown season' });
  });
});
