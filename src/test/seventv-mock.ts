import { json } from './render';

export const SET_ID = '01HXYZ00000000000000000N01';
export const SEASONAL_ID = '01HXYZ00000000000000000S01';

export const emoteId = (n: number, prefix: string) => `${prefix}${String(n).padStart(25, '0')}`;

/** One emote change as the tests see it, whichever 7TV API carried it. */
export interface Mutation {
  id: string;
  action: 'ADD' | 'REMOVE';
  emote_id: string;
  name?: string;
}

/** Answers a change: an error message refuses it, undefined accepts it. */
export type OnChange = (change: Mutation) => string | undefined;

const STRING = '"(?:[^"\\\\]|\\\\.)*"';
const V4_CHANGE = new RegExp(
  `emoteSet\\(id: (${STRING})\\) \\{ (addEmote|removeEmote)\\(id: \\{ emoteId: (${STRING}), alias: (${STRING}) \\}`,
);

function v4Change(query: string): Mutation {
  const [, id, field, emoteId, alias] = V4_CHANGE.exec(query)!;
  return { id: JSON.parse(id!), action: field === 'addEmote' ? 'ADD' : 'REMOVE', emote_id: JSON.parse(emoteId!), name: JSON.parse(alias!) };
}

/** 7TV's write side: v4 batches for emote changes, v3 for creating sets. */
export function sevenTvWrite(onChange: OnChange) {
  return {
    v4: (init?: RequestInit) => {
      const batch = JSON.parse(String(init?.body)) as Array<{ query: string }>;
      return json(
        batch.map(({ query }) => {
          const error = onChange(v4Change(query));
          return error ? { errors: [{ message: error }] } : { data: { emoteSets: {} } };
        }),
      );
    },
    'https://7tv.io/v3/gql': (_url: string, init?: RequestInit) => {
      const { query, variables } = JSON.parse(String(init?.body));
      if (String(query).includes('createEmoteSet')) return json({ data: { createEmoteSet: { id: 'NEW' } } });
      const error = onChange(variables);
      return json(error ? { errors: [{ message: error }] } : { data: { emoteSet: { emotes: [] } } });
    },
  };
}

/** 7TV and IVR as the set picker sees them: one channel, niena, with a main and a spooky set. */
export function sevenTvRead(
  sets: Record<string, { name: string; emotes: Array<[string, string]> }>,
  onChange: OnChange = () => undefined,
) {
  const writes = sevenTvWrite(onChange);
  return {
    'https://7tv.io/v3/gql': writes['https://7tv.io/v3/gql'],
    'https://api.ivr.fi/': () => json([{ id: '123', displayName: 'niena' }]),
    'https://7tv.io/v4/gql': (_url: string, init?: RequestInit) =>
      Array.isArray(JSON.parse(String(init?.body))) ? writes.v4(init) : json({
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
