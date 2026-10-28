import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { getThreshold, listCandidates, setThreshold } from '../candidates';

const db = env.DB;
let comparisons = 0;

/** One channel's comparison showing these pairings. */
async function sighted(channel: string, pairs: Array<[string, string, string?]>, season = 'halloween') {
  const id = `CMP${++comparisons}`;
  await db.batch([
    db
      .prepare(
        `INSERT INTO comparisons (id, normal_set_id, seasonal_set_id, season, channel_id, channel_name, submitted_by, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, 'T1', '2026-10-27T12:00:00Z')`,
      )
      .bind(id, `N${id}`, `S${id}`, season, channel, channel),
    ...pairs.map(([o, r, alias = 'peepoHappy']) =>
      db
        .prepare('INSERT INTO sightings (comparison_id, season, original_id, replacement_id, alias, channel_id) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, season, o, r, alias, channel),
    ),
  ]);
}

const mapped = (o: string, r: string, source = 'manual') =>
  db.prepare("INSERT INTO mappings (id, season, original_id, replacement_id, source) VALUES (?, 'halloween', ?, ?, ?)").bind(`M-${o}`, o, r, source).run();

beforeEach(async () => {
  await db.batch([
    db.prepare('DELETE FROM sightings'),
    db.prepare('DELETE FROM comparisons'),
    db.prepare('DELETE FROM rejections'),
    db.prepare('DELETE FROM settings'),
    db.prepare("DELETE FROM mappings WHERE source <> 'seed'"),
  ]);
});

describe('listCandidates', () => {
  it('lists a pairing once two different channels show it', async () => {
    await sighted('C1', [['O1', 'R1']]);
    await sighted('C2', [['O1', 'R1']]);
    expect(await listCandidates(db, 'halloween', 2)).toEqual([
      { originalId: 'O1', replacementId: 'R1', alias: 'peepoHappy', channels: 2, current: null },
    ]);
  });

  it('counts a channel once however many of its comparisons show the pairing', async () => {
    await sighted('C1', [['O1', 'R1']]);
    await sighted('C1', [['O1', 'R1']]);
    expect(await listCandidates(db, 'halloween', 2)).toEqual([]);
  });

  it('leaves out pairings already in the preset, and rejected ones', async () => {
    for (const channel of ['C1', 'C2']) await sighted(channel, [['O1', 'R1'], ['O2', 'R2']]);
    await mapped('O1', 'R1');
    await db.prepare("INSERT INTO rejections (season, original_id, replacement_id, rejected_by) VALUES ('halloween', 'O2', 'R2', 'T1')").run();
    expect(await listCandidates(db, 'halloween', 2)).toEqual([]);
  });

  it('shows the current mapping when the original points elsewhere', async () => {
    for (const channel of ['C1', 'C2']) await sighted(channel, [['O1', 'R1']]);
    await mapped('O1', 'RX');
    expect(await listCandidates(db, 'halloween', 2)).toMatchObject([{ originalId: 'O1', replacementId: 'R1', current: 'RX' }]);
  });

  it('keeps seasons apart', async () => {
    for (const channel of ['C1', 'C2']) await sighted(channel, [['O1', 'R1']], 'winter');
    expect(await listCandidates(db, 'halloween', 2)).toEqual([]);
    expect(await listCandidates(db, 'winter', 2)).toHaveLength(1);
  });

  it('brings a deleted mapping back once its sightings still qualify', async () => {
    for (const channel of ['C1', 'C2']) await sighted(channel, [['O1', 'R1']]);
    await mapped('O1', 'R1');
    expect(await listCandidates(db, 'halloween', 2)).toEqual([]);
    await db.prepare("DELETE FROM mappings WHERE original_id = 'O1'").run();
    expect(await listCandidates(db, 'halloween', 2)).toHaveLength(1);
  });

  it('puts the pairings most channels made first', async () => {
    for (const channel of ['C1', 'C2']) await sighted(channel, [['O1', 'R1', 'Sadge']]);
    for (const channel of ['C1', 'C2', 'C3']) await sighted(channel, [['O2', 'R2', 'KEKW']]);
    expect((await listCandidates(db, 'halloween', 2)).map((c) => c.alias)).toEqual(['KEKW', 'Sadge']);
  });
});

describe('threshold', () => {
  it('uses the stored threshold, 2 until one is set', async () => {
    for (const channel of ['C1', 'C2']) await sighted(channel, [['O1', 'R1']]);
    expect(await getThreshold(db)).toBe(2);
    await setThreshold(db, 3);
    expect(await getThreshold(db)).toBe(3);
    expect(await listCandidates(db, 'halloween', await getThreshold(db))).toEqual([]);
  });
});
