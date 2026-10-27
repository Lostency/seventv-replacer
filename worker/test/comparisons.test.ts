import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiError, ComparisonPreview, ComparisonSubmitted } from '../../shared/types';
import { call, json, mockOutbound, signIn, twitchHandlers } from './helpers';

const NORMAL = '01HXYZ00000000000000000N01';
const SEASONAL = '01HXYZ00000000000000000S01';
const OTHER = '01HXYZ00000000000000000T01';

const v3Set = (id: string, owner: string, emotes: Array<[string, string]>) => ({
  id,
  name: `Set ${id.slice(-3)}`,
  capacity: 1000,
  owner: { id: `U-${owner}`, username: owner, display_name: owner },
  emotes: emotes.map(([name, emoteId]) => ({ id: emoteId, name })),
});

const sets: Record<string, unknown> = {
  [NORMAL]: v3Set(NORMAL, 'niena', [['peepoHappy', 'A'], ['Sadge', 'B'], ['KEKW', 'C'], ['OnlyNormal', 'D']]),
  [SEASONAL]: v3Set(SEASONAL, 'editor', [['peepoHappy', 'A2'], ['sadge', 'B2'], ['KEKW', 'C'], ['OnlySeasonal', 'E']]),
  [OTHER]: v3Set(OTHER, 'niena', [['peepoHappy', 'A3']]),
};

const sevenTv = {
  'https://7tv.io/v3/emote-sets/': (url: string) => {
    const set = sets[url.split('/').pop()!];
    return set ? json(set) : json({ error: 'not found' }, 404);
  },
};

const post = (path: string, cookie: string, body: unknown) =>
  call(path, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const sightings = () =>
  env.DB.prepare('SELECT original_id AS o, replacement_id AS r, alias, channel_id AS ch, season FROM sightings ORDER BY alias COLLATE NOCASE')
    .all()
    .then((r) => r.results);

let cookie: string;

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM sightings'), env.DB.prepare('DELETE FROM comparisons')]);
  cookie = await signIn('viewer');
  mockOutbound({ ...twitchHandlers(), ...sevenTv });
});

afterEach(() => vi.unstubAllGlobals());

describe('comparisons', () => {
  it('needs a signed-in user', async () => {
    const res = await post('/api/comparisons/preview', '', { normalSetId: NORMAL, seasonalSetId: SEASONAL });
    expect(res.status).toBe(401);
  });

  it('previews alias matches, credited to the normal set’s owner', async () => {
    const res = await post('/api/comparisons/preview', cookie, { normalSetId: NORMAL, seasonalSetId: SEASONAL });
    const body = await res.json<ComparisonPreview>();
    expect(res.status).toBe(200);
    expect(body.channel).toBe('niena');
    expect(body.cooldown).toBeNull();
    expect(body.matches).toEqual([
      { alias: 'peepoHappy', originalId: 'A', replacementId: 'A2' },
      { alias: 'Sadge', originalId: 'B', replacementId: 'B2' },
    ]);
  });

  it('records the ticked matches as sightings', async () => {
    const res = await post('/api/comparisons', cookie, {
      normalSetId: NORMAL,
      seasonalSetId: SEASONAL,
      season: 'halloween',
      excluded: [{ originalId: 'B', replacementId: 'B2' }],
    });
    const body = await res.json<ComparisonSubmitted>();
    expect(res.status).toBe(201);
    expect(body).toMatchObject({ channel: 'niena', sightings: 1 });
    expect(await sightings()).toEqual([{ o: 'A', r: 'A2', alias: 'peepoHappy', ch: 'U-niena', season: 'halloween' }]);
  });

  it('holds the same pair for 14 days, then replaces its sightings', async () => {
    const submit = (excluded: unknown[] = []) =>
      post('/api/comparisons', cookie, { normalSetId: NORMAL, seasonalSetId: SEASONAL, season: 'halloween', excluded });
    await submit([{ originalId: 'B', replacementId: 'B2' }]);

    const again = await submit();
    const refused = await again.json<ApiError>();
    expect(again.status).toBe(409);
    const days = (Date.parse(refused.cooldown!.availableFrom) - Date.parse(refused.cooldown!.comparedOn)) / 86_400_000;
    expect(days).toBe(14);

    const preview = await post('/api/comparisons/preview', cookie, { normalSetId: NORMAL, seasonalSetId: SEASONAL });
    expect((await preview.json<ComparisonPreview>()).cooldown).toEqual(refused.cooldown);

    await env.DB.prepare("UPDATE comparisons SET submitted_at = '2020-01-01T00:00:00.000Z'").run();
    expect((await submit()).status).toBe(201);
    expect((await sightings()).map((s) => s.alias)).toEqual(['peepoHappy', 'Sadge']);
    const { results } = await env.DB.prepare('SELECT COUNT(*) AS n FROM comparisons').all<{ n: number }>();
    expect(results[0]!.n).toBe(1);
  });

  it('leaves other pairs from the same channel alone', async () => {
    await post('/api/comparisons', cookie, { normalSetId: NORMAL, seasonalSetId: SEASONAL, season: 'halloween', excluded: [] });
    const other = await post('/api/comparisons', cookie, {
      normalSetId: NORMAL,
      seasonalSetId: OTHER,
      season: 'winter',
      excluded: [],
    });
    expect(other.status).toBe(201);
    expect(await sightings()).toHaveLength(3);
  });

  it('refuses the same set on both sides', async () => {
    const res = await post('/api/comparisons/preview', cookie, { normalSetId: NORMAL, seasonalSetId: NORMAL });
    expect(res.status).toBe(400);
  });

  it('says when 7TV has no such set', async () => {
    const res = await post('/api/comparisons/preview', cookie, {
      normalSetId: NORMAL,
      seasonalSetId: '01HXYZ00000000000000000Z99',
    });
    expect(res.status).toBe(404);
    expect((await res.json<ApiError>()).error).toMatch(/no emote set/);
  });

  it('refuses an unknown season', async () => {
    const res = await post('/api/comparisons', cookie, { normalSetId: NORMAL, seasonalSetId: SEASONAL, season: 'easter', excluded: [] });
    expect(res.status).toBe(400);
  });
});
