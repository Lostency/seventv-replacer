import { describe, expect, it, vi } from 'vitest';
import { fetchChannelSets, fetchEmoteSet, parseChannel, parseSetRef, SevenTvError } from './seventv';

const SET = '01HXYZ0000000000000000ABCD';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('parseSetRef', () => {
  it('reads a 7TV set link', () => expect(parseSetRef(`https://7tv.app/emote-sets/${SET}`)).toBe(SET));
  it('reads a bare ULID', () => expect(parseSetRef(` ${SET} `)).toBe(SET));
  it('reads an old ObjectID', () => expect(parseSetRef('60b6f8d9a2b4c1e7f8a9b0c1')).toBe('60b6f8d9a2b4c1e7f8a9b0c1'));
  it('does not mistake a channel for a set', () => expect(parseSetRef('niena')).toBeNull());
});

describe('parseChannel', () => {
  it.each([
    ['niena', 'niena'],
    ['@Niena', 'niena'],
    ['https://www.twitch.tv/niena/videos', 'niena'],
    ['not a channel', null],
    ['', null],
  ])('%s → %s', (input, login) => expect(parseChannel(input)).toBe(login));
});

describe('fetchEmoteSet', () => {
  it('normalises a v3 set', async () => {
    const fetchFn = vi.fn(async () =>
      json({
        id: SET,
        name: 'Main',
        capacity: 1000,
        owner: { id: 'U1', username: 'niena', display_name: 'Niena' },
        emotes: [{ id: 'E1', name: 'peepoHappy', data: { name: 'peepoHappy' } }],
      }),
    );
    expect(await fetchEmoteSet(SET, fetchFn)).toEqual({
      id: SET,
      name: 'Main',
      capacity: 1000,
      owner: { id: 'U1', name: 'Niena' },
      emotes: [{ id: 'E1', alias: 'peepoHappy' }],
    });
  });

  it('treats a missing emote list as an empty set', async () => {
    const set = await fetchEmoteSet(SET, async () => json({ id: SET, name: 'Empty', emotes: null }));
    expect(set.emotes).toEqual([]);
  });

  it('says plainly when the set does not exist', async () => {
    await expect(fetchEmoteSet(SET, async () => json({ error: 'not found' }, 404))).rejects.toMatchObject({
      kind: 'not-found',
    });
  });

  it('reports a network failure as unavailable', async () => {
    const error = await fetchEmoteSet(SET, async () => Promise.reject(new TypeError('offline'))).catch((e) => e);
    expect(error).toBeInstanceOf(SevenTvError);
    expect(error.kind).toBe('unavailable');
  });
});

describe('fetchChannelSets', () => {
  const route = (handlers: Record<string, () => Response>) =>
    vi.fn(async (url: string | URL | Request) => {
      const key = Object.keys(handlers).find((k) => String(url).includes(k));
      if (!key) throw new TypeError(`unexpected ${String(url)}`);
      return handlers[key]!();
    });

  it('lists owned sets with the active one first, plus an active set owned by an editor', async () => {
    const fetchFn = route({
      'api.ivr.fi': () => json([{ id: '123', displayName: 'Niena' }]),
      '/v4/gql': () =>
        json({
          data: {
            users: {
              userByConnection: {
                id: 'U1',
                ownedEmoteSets: [
                  { id: 'S1', name: 'Main', kind: 'NORMAL' },
                  { id: 'S2', name: 'Spooky', kind: 'NORMAL' },
                  { id: 'P', name: 'Personal', kind: 'PERSONAL' },
                ],
              },
            },
          },
        }),
      '/v3/users/U1': () => json({ connections: [{ platform: 'TWITCH', emote_set_id: 'S2' }] }),
    });
    expect(await fetchChannelSets('niena', fetchFn)).toEqual({
      channel: 'Niena',
      sets: [
        { id: 'S2', name: 'Spooky', active: true },
        { id: 'S1', name: 'Main', active: false },
      ],
    });
  });

  it('includes an active set owned by someone else', async () => {
    const fetchFn = route({
      'api.ivr.fi': () => json([{ id: '123', displayName: 'Niena' }]),
      '/v4/gql': () => json({ data: { users: { userByConnection: { id: 'U1', ownedEmoteSets: [] } } } }),
      '/v3/users/U1': () =>
        json({ connections: [{ platform: 'TWITCH', emote_set_id: 'X', emote_set: { id: 'X', name: 'Editor set' } }] }),
    });
    expect((await fetchChannelSets('niena', fetchFn)).sets).toEqual([{ id: 'X', name: 'Editor set', active: true }]);
  });

  it('says when the Twitch channel does not exist', async () => {
    const fetchFn = route({ 'api.ivr.fi': () => json([]) });
    await expect(fetchChannelSets('nobody', fetchFn)).rejects.toThrow('There’s no Twitch channel called “nobody”.');
  });

  it('says when the channel has no 7TV account', async () => {
    const fetchFn = route({
      'api.ivr.fi': () => json([{ id: '123', displayName: 'Niena' }]),
      '/v4/gql': () => json({ data: { users: { userByConnection: null } } }),
    });
    await expect(fetchChannelSets('niena', fetchFn)).rejects.toMatchObject({ kind: 'no-account' });
  });
});
