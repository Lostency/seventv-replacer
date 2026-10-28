import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrokenEmote, BrokenListResponse } from '../../shared/types';
import { call, json, mockOutbound, signIn } from './helpers';

const db = env.DB;
let admin: string;

const send = (method: string, path: string, body?: unknown, cookie = '') =>
  call(path, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const report = (overrides: Record<string, unknown> = {}) =>
  send('POST', '/api/broken-emotes', {
    season: 'halloween',
    originalId: 'O1',
    replacementId: 'R1',
    brokenId: 'R1',
    reason: 'Emote is private',
    ...overrides,
  });

/** 7TV as the Worker asks it about one emote. */
const sevenTv = (answer: () => Response) => mockOutbound({ 'https://7tv.io/v3/emotes/': answer });
const listed = async () =>
  (await (await send('GET', '/api/admin/broken/halloween', undefined, admin)).json<BrokenListResponse>()).broken;

beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM broken_reports'),
    db.prepare("DELETE FROM mappings WHERE original_id LIKE 'O%'"),
    db.prepare("INSERT INTO mappings (id, season, original_id, replacement_id, source) VALUES ('M-O1', 'halloween', 'O1', 'R1', 'seed')"),
  ]);
  admin = await signIn('niena');
});

afterEach(() => vi.unstubAllGlobals());

describe('broken emote reports', () => {
  it('records a report 7TV confirms, counting repeats on one row', async () => {
    sevenTv(() => json({ error: 'emote not found' }, 404));
    expect((await report()).status).toBe(202);
    await report({ reason: 'Unknown Emote' });
    expect(await listed()).toEqual<BrokenEmote[]>([
      {
        originalId: 'O1',
        replacementId: 'R1',
        brokenId: 'R1',
        reason: 'Unknown Emote',
        reports: 2,
        firstSeen: expect.any(String),
        lastSeen: expect.any(String),
      },
    ]);
  });

  it('ignores a report 7TV doesn’t confirm', async () => {
    sevenTv(() => json({ id: 'R1', lifecycle: 3, flags: 0 }));
    expect((await report()).status).toBe(202);
    expect(await listed()).toEqual([]);
  });

  it('ignores a pairing that isn’t in the preset', async () => {
    const outbound = sevenTv(() => json({}, 404));
    expect((await report({ replacementId: 'R9', brokenId: 'R9' })).status).toBe(202);
    expect(outbound).not.toHaveBeenCalled();
    expect(await listed()).toEqual([]);
  });

  it('refuses a report naming neither side as broken', async () => {
    expect((await report({ brokenId: 'X' })).status).toBe(400);
  });

  it('hides a report once the mapping changed, and dismissing removes it', async () => {
    sevenTv(() => json({}, 404));
    await report();
    await db.prepare("UPDATE mappings SET replacement_id = 'R2' WHERE original_id = 'O1'").run();
    expect(await listed()).toEqual([]);
    await db.prepare("UPDATE mappings SET replacement_id = 'R1' WHERE original_id = 'O1'").run();
    expect(await listed()).toHaveLength(1);

    const res = await send('DELETE', '/api/admin/broken/halloween/O1/R1', undefined, admin);
    expect(res.status).toBe(200);
    const { dismissed } = await res.json<{ dismissed: BrokenEmote }>();
    expect(dismissed).toMatchObject({ originalId: 'O1', reports: 1 });
    expect(await listed()).toEqual([]);

    // Undo puts the report back as it was.
    expect((await send('PUT', '/api/admin/broken', { season: 'halloween', ...dismissed }, admin)).status).toBe(200);
    expect(await listed()).toEqual([dismissed]);
  });

  it('shows the list to admins only', async () => {
    const viewer = await signIn('viewer');
    expect((await send('GET', '/api/admin/broken/halloween', undefined, viewer)).status).toBe(403);
  });
});
