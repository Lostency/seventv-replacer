import { beforeEach, describe, expect, it } from 'vitest';
import { fakeSevenTv } from '../test/fake-seventv';
import { fixProblem, FixRefused, recordFix } from './problems';
import type { RunProblem, RunRecord } from './run';
import { forgetRunProblems, loadProblems, updateProblems } from './storage';

const problem = (overrides: Partial<RunProblem> = {}): RunProblem => ({
  id: 'P1',
  runId: 'R1',
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
  at: '2026-10-28T12:00:00.000Z',
  ...overrides,
});

const record = (overrides: Partial<RunRecord> = {}): RunRecord => ({
  id: 'R1',
  at: '2026-10-28T12:00:00.000Z',
  mode: 'in-place',
  season: 'halloween',
  setId: 'S',
  setName: 'Main',
  createdSet: false,
  swaps: [],
  added: [],
  ...overrides,
});

describe('fixProblem', () => {
  it('swaps in the seasonal emote under the new name', async () => {
    const tv = fakeSevenTv({ S: [{ id: 'A', alias: 'a,b' }, { id: 'X', alias: 'x' }] });
    await fixProblem(problem(), 'ab', tv.writer, tv.read);
    expect(tv.store.get('S')).toEqual([{ id: 'X', alias: 'x' }, { id: 'A2', alias: 'ab' }]);
  });

  it('puts the normal emote back when 7TV refuses the new name too', async () => {
    const tv = fakeSevenTv({ S: [{ id: 'A', alias: 'peepo' }] });
    await expect(fixProblem(problem(), 'still,bad', tv.writer, tv.read)).rejects.toThrow('Invalid emote name');
    expect(tv.store.get('S')).toEqual([{ id: 'A', alias: 'peepo' }]);
  });

  it('leaves a set alone that changed since the run', async () => {
    const tv = fakeSevenTv({ S: [{ id: 'Z', alias: 'a,b' }] });
    await expect(fixProblem(problem(), 'ab', tv.writer, tv.read)).rejects.toBeInstanceOf(FixRefused);
    expect(tv.store.get('S')).toEqual([{ id: 'Z', alias: 'a,b' }]);
  });

  it('adds the seasonal version of a missing emote under the new name', async () => {
    const tv = fakeSevenTv({ S: [] });
    await fixProblem(problem({ kind: 'missing' }), 'ab', tv.writer, tv.read);
    expect(tv.store.get('S')).toEqual([{ id: 'A2', alias: 'ab' }]);
  });

  it('can’t fix a broken emote', async () => {
    const tv = fakeSevenTv({ S: [{ id: 'A', alias: 'a' }] });
    await expect(fixProblem(problem({ kind: 'broken' }), 'a', tv.writer, tv.read)).rejects.toBeInstanceOf(FixRefused);
    expect(tv.calls).toEqual([]);
  });
});

describe('recordFix', () => {
  it('adds the fixed swap to an in-place run, so Undo reverses it', () => {
    expect(recordFix(record(), problem(), 'ab').swaps).toEqual([{ fromId: 'A', toId: 'A2', alias: 'ab', originalAlias: 'a,b' }]);
  });

  it('records a fixed missing emote as a swap too, so Undo brings the normal one back', () => {
    expect(recordFix(record(), problem({ kind: 'missing' }), 'ab').swaps).toEqual([
      { fromId: 'A', toId: 'A2', alias: 'ab', originalAlias: 'a,b' },
    ]);
  });

  it('swaps the stand-in for the seasonal emote in a filled set', () => {
    const before = record({ mode: 'duplicate', setId: 'T', added: [{ id: 'A', alias: 'a,b' }] });
    expect(recordFix(before, problem({ mode: 'duplicate', setId: 'T' }), 'ab').added).toEqual([{ id: 'A2', alias: 'ab' }]);
  });

  it('leaves a created set’s record alone: Undo deletes the whole set', () => {
    const before = record({ mode: 'duplicate', createdSet: true });
    expect(recordFix(before, problem({ mode: 'duplicate' }), 'ab')).toEqual(before);
  });
});

describe('saved problems', () => {
  beforeEach(() => localStorage.clear());

  it('keeps problems across page loads until they are taken out', () => {
    updateProblems((list) => [...list, problem(), problem({ id: 'P2', runId: 'R2' })]);
    expect(loadProblems().map((p) => p.id)).toEqual(['P1', 'P2']);
    expect(forgetRunProblems('R1').map((p) => p.id)).toEqual(['P2']);
    expect(loadProblems().map((p) => p.id)).toEqual(['P2']);
  });
});
