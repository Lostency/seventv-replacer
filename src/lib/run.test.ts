import { describe, expect, it, vi } from 'vitest';
import type { EmoteSet } from '@shared/seventv';
import { fakeSevenTv } from '../test/fake-seventv';
import { executeRun, planSwaps, RunNotStarted, type RunProblem } from './run';
import { WriteError } from './seventv-write';
import { undoRun } from './undo';

const MAPPINGS = [
  { originalId: 'A', replacementId: 'A2' },
  { originalId: 'B', replacementId: 'B2' },
  { originalId: 'C', replacementId: 'C2' },
];
const quick = { pauseMs: 0, sleep: async () => {}, checkEmote: async () => 'unknown' as const };

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
    const onProblem = vi.fn();
    await executeRun(
      { mode: 'in-place', season: 'halloween', source: set, swaps: planSwaps(set, MAPPINGS, 'in-place').swaps },
      tv.writer,
      { ...quick, onProblem },
    );
    expect(onProblem).not.toHaveBeenCalled();
    expect(tv.store.get('S')).toEqual([{ id: 'A2', alias: 'üäöéèà' }]);
  });

  it('sets a refused name aside with the normal emote in its place, and carries on', async () => {
    const set = source([['a,b', 'A'], ['b', 'B']]);
    const tv = fakeSevenTv({ S: set.emotes });
    // The normal emote goes back under its old name: here 7TV only refuses the seasonal one.
    const add = tv.writer.addEmote;
    tv.writer.addEmote = async (setId, id, alias) => {
      if (id === 'A') tv.store.get(setId)!.push({ id, alias });
      else await add(setId, id, alias);
    };
    const problems: RunProblem[] = [];
    const report = await executeRun(
      { mode: 'in-place', season: 'halloween', source: set, swaps: planSwaps(set, MAPPINGS, 'in-place').swaps },
      tv.writer,
      { ...quick, onProblem: (p) => problems.push(p) },
    );
    expect(problems).toEqual([
      {
        id: expect.any(String),
        runId: report.record.id,
        kind: 'refused',
        mode: 'in-place',
        season: 'halloween',
        setId: 'S',
        setName: 'Main',
        alias: 'a,b',
        emoteId: 'A2',
        normalId: 'A',
        pairing: { originalId: 'A', replacementId: 'A2' },
        reason: 'Invalid emote name',
        at: expect.any(String),
      },
    ]);
    expect(report.swapped).toBe(1);
    expect(tv.store.get('S')).toEqual(expect.arrayContaining([{ id: 'A', alias: 'a,b' }, { id: 'B2', alias: 'b' }]));
  });

  it('calls a seasonal emote broken when 7TV no longer has it', async () => {
    const set = source([['b', 'B']]);
    const tv = fakeSevenTv({ S: set.emotes }, ['B2']);
    const checkEmote = vi.fn(async (id: string) => (id === 'B2' ? ('broken' as const) : ('ok' as const)));
    const onProblem = vi.fn();
    await executeRun(
      { mode: 'in-place', season: 'halloween', source: set, swaps: planSwaps(set, MAPPINGS, 'in-place').swaps },
      tv.writer,
      { ...quick, checkEmote, onProblem },
    );
    expect(checkEmote).toHaveBeenCalledWith('B2');
    expect(onProblem).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'broken', emoteId: 'B2', normalId: 'B', reason: 'Emote is private' }),
    );
    expect(tv.store.get('S')).toEqual([{ id: 'B', alias: 'b' }]);
  });

  it('turns the pairing round for a revert', async () => {
    const set = source([['b', 'B2']]);
    const tv = fakeSevenTv({ S: set.emotes }, ['B']);
    const onProblem = vi.fn();
    await executeRun(
      { mode: 'revert', season: 'halloween', source: set, swaps: planSwaps(set, MAPPINGS, 'revert').swaps },
      tv.writer,
      { ...quick, onProblem },
    );
    expect(onProblem).toHaveBeenCalledWith(
      expect.objectContaining({ emoteId: 'B', normalId: 'B2', pairing: { originalId: 'B', replacementId: 'B2' } }),
    );
  });

  it('keeps a save 7TV couldn’t make as a problem to retry', async () => {
    const set = source([['a', 'A']]);
    const tv = fakeSevenTv({ S: set.emotes });
    const unsaved = new WriteError('TRANSACTION_ERROR transaction failed', 'conflict');
    tv.writer.addEmotes = async (_set, emotes) => emotes.map(() => ({ ok: false, error: unsaved }));
    const onProblem = vi.fn();
    const report = await executeRun(
      { mode: 'in-place', season: 'halloween', source: set, swaps: planSwaps(set, MAPPINGS, 'in-place').swaps },
      tv.writer,
      { ...quick, onProblem },
    );
    expect(onProblem).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'refused', reason: 'TRANSACTION_ERROR transaction failed' }),
    );
    expect(report.failed).toEqual([{ alias: 'a', reason: 'TRANSACTION_ERROR transaction failed' }]);
    expect(tv.store.get('S')).toEqual([{ id: 'A', alias: 'a' }]);
  });

  it('says the emote is missing when the normal one won’t go back either', async () => {
    const set = source([['a,b', 'A']]);
    const tv = fakeSevenTv({ S: [{ id: 'A', alias: 'a,b' }] });
    const onProblem = vi.fn();
    const report = await executeRun(
      { mode: 'in-place', season: 'halloween', source: set, swaps: planSwaps(set, MAPPINGS, 'in-place').swaps },
      tv.writer,
      { ...quick, onProblem },
    );
    expect(onProblem).toHaveBeenCalledTimes(1);
    expect(onProblem).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'missing', emoteId: 'A2', normalId: 'A', alias: 'a,b' }),
    );
    expect(report.lost).toEqual(['a,b']);
    expect(tv.store.get('S')).toEqual([]);
  });

  it('gives queued fixes their turn after every batch', async () => {
    const set = source(Array.from({ length: 31 }, (_, i): [string, string] => [`e${i}`, `E${i}`]));
    const tv = fakeSevenTv({ S: set.emotes });
    const swaps = set.emotes.map((e) => ({ alias: e.alias, fromId: e.id, toId: `${e.id}x` }));
    const between = vi.fn(async () => {});
    await executeRun({ mode: 'in-place', season: 'halloween', source: set, swaps }, tv.writer, { ...quick, between });
    expect(between).toHaveBeenCalledTimes(2);
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

  it('sets aside an unchanged emote 7TV won’t copy as missing', async () => {
    const set = source([['x,y', 'X']]);
    const tv = fakeSevenTv({ S: set.emotes });
    const onProblem = vi.fn();
    await executeRun({ mode: 'duplicate', season: 'halloween', source: set, swaps: [] }, tv.writer, { ...quick, onProblem });
    expect(onProblem).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'missing', setId: 'NEW1', emoteId: 'X', normalId: null, pairing: null }),
    );
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
