import { describe, expect, it } from 'vitest';
import { matchSets } from './compare';
import type { EmoteSet } from './seventv';

const set = (emotes: Array<[string, string]>): EmoteSet => ({
  id: 'S',
  name: 'S',
  owner: null,
  capacity: null,
  emotes: emotes.map(([alias, id]) => ({ alias, id })),
});

describe('matchSets', () => {
  it('pairs the same alias with a different emote', () => {
    const normal = set([['peepoHappy', 'A'], ['Sadge', 'B']]);
    const seasonal = set([['peepoHappy', 'A2'], ['Sadge', 'B']]);
    expect(matchSets(normal, seasonal)).toEqual([{ alias: 'peepoHappy', originalId: 'A', replacementId: 'A2' }]);
  });

  it('matches aliases regardless of case', () => {
    expect(matchSets(set([['KEKW', 'A']]), set([['kekw', 'Z']]))).toHaveLength(1);
  });

  it('ignores emotes that are only in one set', () => {
    expect(matchSets(set([['OnlyHere', 'A']]), set([['OnlyThere', 'B']]))).toEqual([]);
  });

  it('sorts by alias', () => {
    const matches = matchSets(set([['b', '1'], ['A', '2']]), set([['b', '3'], ['a', '4']]));
    expect(matches.map((m) => m.alias)).toEqual(['A', 'b']);
  });
});
