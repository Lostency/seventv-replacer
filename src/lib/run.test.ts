import { describe, expect, it, vi } from 'vitest';
import type { EmoteSet } from '@shared/seventv';
import { fakeSevenTv } from '../test/fake-seventv';
import { executeRun, planSwaps, RunNotStarted } from './run';
import { WriteError } from './seventv-write';
import { undoRun } from './undo';

const MAPPINGS = [
  { originalId: 'A', replacementId: 'A2' },
  { originalId: 'B', replacementId: 'B2' },
  { originalId: 'C', replacementId: 'C2' },
];
const quick = { pauseMs: 0, sleep: async () => {} };

function source(emotes: Array<[string, string]>): EmoteSet {
  return { id: 'S', name: 'Main', owner: { id: 'U1', name: 'niena' }, capacity: 1000, emotes: emotes.map(([alias, id]) => ({ alias, id })) };
}

describe('planSwaps', () => {
  it('lists swaps and counts emotes with no seasonal version', () => {
    const plan = planSwaps(source([['a', 'A'], ['b', 'B'], ['x', 'X']]), MAPPINGS, 'in-place');
    expect(plan.swaps).toEqual([
      { alias: 'a', fromId: 'A', toId: 'A2' },
      { alias: 'b', fromId: 'B', toId: 'B2' },
    ]);
    expect(plan.unmapped).toBe(1);
  });

  it('runs the preset backwards for a revert', () => {
    const plan = planSwaps(source([['a', 'A2'], ['x', 'A']]), MAPPINGS, 'revert');
    expect(plan.swaps).toEqual([]);
    expect(plan.alreadyThere).toBe(1);
    expect(planSwaps(source([['a', 'A2']]), MAPPINGS, 'revert').swaps).toEqual([{ alias: 'a', fromId: 'A2', toId: 'A' }]);
  });

  it('leaves out a swap whose seasonal emote is already in the set', () => {
    const plan = planSwaps(source([['a', 'A'], ['spooky', 'A2']]), MAPPINGS, 'in-place');
    expect(plan.swaps).toEqual([]);
    expect(plan.alreadyThere).toBe(1);
  });
});

describe('replace in place, then undo', () => {
  it('swaps keeping each alias, and undo puts the set back exactly', async () => {
    const initial: Array<[string, string]> = [['a', 'A'], ['b', 'B'], ['x', 'X']];
    const tv = fakeSevenTv({ S: source(initial).emotes });
    const set = source(initial);
    const plan = planSwaps(set, MAPPINGS, 'in-place');
    const report = await executeRun({ mode: 'in-place', season: 'halloween', source: set, swaps: plan.swaps }, tv.writer, quick);

    expect(report.swapped).toBe(2);
    expect(tv.store.get('S')).toEqual(expect.arrayContaining([{ id: 'A2', alias: 'a' }, { id: 'B2', alias: 'b' }, { id: 'X', alias: 'x' }]));

    const undo = await undoRun(report.record, tv.writer, { ...quick, fetchSet: tv.read });
    expect(undo).toMatchObject({ restored: 2, skipped: [] });
    expect([...tv.store.get('S')!].sort((p, q) => p.id.localeCompare(q.id))).toEqual(set.emotes);
  });

  it('puts the original back when the seasonal emote will not go in', async () => {
    const set = source([['a', 'A'], ['b', 'B']]);
    const tv = fakeSevenTv({ S: set.emotes }, ['B2']);
    const report = await executeRun(
      { mode: 'in-place', season: 'halloween', source: set, swaps: planSwaps(set, MAPPINGS, 'in-place').swaps },
      tv.writer,
      quick,
    );
    expect(report.failed).toEqual([{ alias: 'b', reason: 'Emote is private' }]);
    expect(report.lost).toEqual([]);
    expect(tv.store.get('S')).toContainEqual({ id: 'B', alias: 'b' });
  });

  it('keeps umlauts and accents exactly as they are', async () => {
    const set = source([['üäöéèà', 'A']]);
    const tv = fakeSevenTv({ S: [{ id: 'A', alias: 'üäöéèà' }] });
    const askAlias = vi.fn();
    const report = await executeRun(
      { mode: 'in-place', season: 'halloween', source: set, swaps: planSwaps(set, MAPPINGS, 'in-place').swaps },
      tv.writer,
      { ...quick, askAlias },
    );
    expect(askAlias).not.toHaveBeenCalled();
    expect(report.renamed).toEqual([]);
    expect(tv.store.get('S')).toEqual([{ id: 'A2', alias: 'üäöéèà' }]);
  });

  it('asks for a new name when 7TV refuses one, and reports the rename', async () => {
    const set = source([['a,b', 'A']]);
    const tv = fakeSevenTv({ S: [{ id: 'A', alias: 'a,b' }] });
    const askAlias = vi.fn(async () => 'a_b');
    const report = await executeRun(
      { mode: 'in-place', season: 'halloween', source: set, swaps: planSwaps(set, MAPPINGS, 'in-place').swaps },
      tv.writer,
      { ...quick, askAlias },
    );
    expect(askAlias).toHaveBeenCalledWith({
      alias: 'a,b',
      emoteId: 'A2',
      reason: 'Invalid emote name',
      suggestion: 'ab',
      role: 'seasonal',
    });
    expect(report.renamed).toEqual([{ from: 'a,b', to: 'a_b' }]);
    expect(tv.store.get('S')).toEqual([{ id: 'A2', alias: 'a_b' }]);
  });

  it('doesn’t ask for a new name when 7TV only failed to save', async () => {
    const set = source([['a', 'A']]);
    const tv = fakeSevenTv({ S: set.emotes });
    const unsaved = new WriteError('TRANSACTION_ERROR transaction failed', 'conflict');
    tv.writer.addEmotes = async (_set, emotes) => emotes.map(() => ({ ok: false, error: unsaved }));
    const askAlias = vi.fn();
    const report = await executeRun(
      { mode: 'in-place', season: 'halloween', source: set, swaps: planSwaps(set, MAPPINGS, 'in-place').swaps },
      tv.writer,
      { ...quick, askAlias },
    );
    expect(askAlias).not.toHaveBeenCalled();
    expect(report.failed).toEqual([{ alias: 'a', reason: 'TRANSACTION_ERROR transaction failed' }]);
    expect(tv.store.get('S')).toEqual([{ id: 'A', alias: 'a' }]);
  });

  it('asks again for the original when the user skips the seasonal one', async () => {
    const set = source([['a,b', 'A']]);
    const tv = fakeSevenTv({ S: [{ id: 'A', alias: 'a,b' }] });
    const askAlias = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('ab');
    const report = await executeRun(
      { mode: 'in-place', season: 'halloween', source: set, swaps: planSwaps(set, MAPPINGS, 'in-place').swaps },
      tv.writer,
      { ...quick, askAlias },
    );
    expect(askAlias.mock.calls[1]![0]).toMatchObject({ emoteId: 'A', role: 'normal' });
    expect(report.failed).toHaveLength(1);
    expect(report.lost).toEqual([]);
    expect(tv.store.get('S')).toEqual([{ id: 'A', alias: 'ab' }]);
  });

  it('saves the record after every batch, so a closed tab can still be undone', async () => {
    const set = source([['a', 'A'], ['b', 'B']]);
    const tv = fakeSevenTv({ S: set.emotes });
    const saved: number[] = [];
    await executeRun(
      { mode: 'in-place', season: 'halloween', source: set, swaps: planSwaps(set, MAPPINGS, 'in-place').swaps },
      tv.writer,
      { ...quick, onRecord: (r) => saved.push(r.swaps.length) },
    );
    expect(saved).toEqual([2]);
  });

  it('skips emotes changed since the run when undoing', async () => {
    const set = source([['a', 'A'], ['b', 'B']]);
    const tv = fakeSevenTv({ S: set.emotes });
    const { record } = await executeRun(
      { mode: 'in-place', season: 'halloween', source: set, swaps: planSwaps(set, MAPPINGS, 'in-place').swaps },
      tv.writer,
      quick,
    );
    // The streamer swapped "b" by hand afterwards.
    tv.store.set('S', [{ id: 'A2', alias: 'a' }, { id: 'Z', alias: 'b' }]);
    const undo = await undoRun(record, tv.writer, { ...quick, fetchSet: tv.read });
    expect(undo).toMatchObject({ restored: 1, skipped: ['b'] });
    expect(tv.store.get('S')).toEqual([{ id: 'Z', alias: 'b' }, { id: 'A', alias: 'a' }]);
  });

  it('stops when the token expires, and says which emotes are now missing', async () => {
    const set = source([['a', 'A'], ['b', 'B'], ['c', 'C']]);
    const tv = fakeSevenTv({ S: set.emotes });
    // The removals go through, then the token dies before the additions.
    tv.writer.expireTokenAfter = 1;
    const report = await executeRun(
      { mode: 'in-place', season: 'halloween', source: set, swaps: planSwaps(set, MAPPINGS, 'in-place').swaps },
      tv.writer,
      quick,
    );
    expect(report.stopped).toMatch(/Log out of 7tv\.app/);
    expect(report.record.swaps).toEqual([]);
    expect(report.lost).toEqual(['a', 'b', 'c']);
  });
});

describe('duplicate + replace', () => {
  it('fills a new set with the seasonal versions, and undo deletes it', async () => {
    const set = source([['a', 'A'], ['x', 'X']]);
    const tv = fakeSevenTv({ S: set.emotes });
    const report = await executeRun(
      {
        mode: 'duplicate',
        season: 'halloween',
        source: set,
        swaps: planSwaps(set, MAPPINGS, 'duplicate').swaps,
        target: { kind: 'new', name: 'Main (Halloween)' },
      },
      tv.writer,
      quick,
    );
    expect(report).toMatchObject({ swapped: 1, copied: 1 });
    expect(report.record).toMatchObject({ setId: 'NEW1', setName: 'Main (Halloween)', createdSet: true });
    expect(tv.store.get('NEW1')).toEqual([{ id: 'A2', alias: 'a' }, { id: 'X', alias: 'x' }]);
    expect(tv.store.get('S')).toEqual(set.emotes);

    expect(await undoRun(report.record, tv.writer, quick)).toMatchObject({ deletedSet: true });
    expect(report.record.added).toEqual([]);
    expect(tv.store.has('NEW1')).toBe(false);
  });

  it('copies the normal emote when its seasonal version will not go in', async () => {
    const set = source([['a', 'A']]);
    const tv = fakeSevenTv({ S: set.emotes }, ['A2']);
    const report = await executeRun(
      { mode: 'duplicate', season: 'halloween', source: set, swaps: planSwaps(set, MAPPINGS, 'duplicate').swaps },
      tv.writer,
      quick,
    );
    expect(tv.store.get('NEW1')).toEqual([{ id: 'A', alias: 'a' }]);
    expect(report.failed).toHaveLength(1);
  });

  it('explains what to do when 7TV will not create a set', async () => {
    const set = source([['a', 'A']]);
    const tv = fakeSevenTv({ S: set.emotes });
    tv.writer.refuseCreate = true;
    const run = executeRun({ mode: 'duplicate', season: 'halloween', source: set, swaps: [] }, tv.writer, quick);
    await expect(run).rejects.toBeInstanceOf(RunNotStarted);
    await expect(run).rejects.toThrow(/Create an empty set on 7TV, then choose it as the target/);
  });

  it('fills an existing empty set, and undo takes out only what it added', async () => {
    const set = source([['a', 'A']]);
    const tv = fakeSevenTv({ S: set.emotes, T: [{ id: 'K', alias: 'kept' }] });
    const target = { ...(await tv.read('T')), name: 'Spare' };
    const report = await executeRun(
      { mode: 'duplicate', season: 'halloween', source: set, swaps: planSwaps(set, MAPPINGS, 'duplicate').swaps, target: { kind: 'existing', set: target } },
      tv.writer,
      quick,
    );
    expect(report.record).toMatchObject({ setId: 'T', createdSet: false, added: [{ id: 'A2', alias: 'a' }] });
    await undoRun(report.record, tv.writer, { ...quick, fetchSet: tv.read });
    expect(tv.store.get('T')).toEqual([{ id: 'K', alias: 'kept' }]);
  });
});
