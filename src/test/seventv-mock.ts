import { json } from './render';

export const SET_ID = '01HXYZ00000000000000000N01';
export const SEASONAL_ID = '01HXYZ00000000000000000S01';

export const emoteId = (n: number, prefix: string) => `${prefix}${String(n).padStart(25, '0')}`;

/** 7TV and IVR as the set picker sees them: one channel, niena, with a main and a spooky set. */
export function sevenTvRead(sets: Record<string, { name: string; emotes: Array<[string, string]> }>) {
  return {
    'https://api.ivr.fi/': () => json([{ id: '123', displayName: 'niena' }]),
    'https://7tv.io/v4/gql': () =>
      json({
        data: {
          users: {
            userByConnection: {
              id: 'U1',
              ownedEmoteSets: Object.entries(sets).map(([id, s]) => ({ id, name: s.name, kind: 'NORMAL' })),
            },
          },
        },
      }),
    'https://7tv.io/v3/users/': () => json({ connections: [{ platform: 'TWITCH', emote_set_id: SET_ID }] }),
    'https://7tv.io/v3/emote-sets/': (url: string) => {
      const id = url.split('/').pop()!;
      const set = sets[id];
      if (!set) return json({ error: 'not found' }, 404);
      return json({
        id,
        name: set.name,
        capacity: 1000,
        owner: { id: 'U1', username: 'niena', display_name: 'niena' },
        emotes: set.emotes.map(([name, eid]) => ({ id: eid, name })),
      });
    },
  };
}
