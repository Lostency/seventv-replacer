import { describe, expect, it, vi } from 'vitest';
import { suggestAlias } from './alias';
import { createWriter, WriteError } from './seventv-write';

const ok = () => new Response(JSON.stringify({ data: { emoteSet: { emotes: [] } } }));
const limited = () => new Response(JSON.stringify({ errors: [{ message: 'Rate limit reached' }] }), { status: 429 });

const fast = { sleep: async () => {}, pauseMs: 0 };
const body = (init: RequestInit | undefined) => JSON.parse(String(init?.body));
const answers = (n: number, error?: (i: number) => string | undefined) =>
  new Response(
    JSON.stringify(
      Array.from({ length: n }, (_, i) => (error?.(i) ? { errors: [{ message: error(i) }] } : { data: { emoteSets: {} } })),
    ),
  );

describe('createWriter', () => {
  it('sends changes to 7TV’s v4 API as one batch, with the token', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => answers(1));
    await createWriter('tok', { fetchFn, ...fast }).addEmote('S', 'E', 'peepoHappy');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://7tv.io/v4/gql');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(body(init)).toEqual([
      { query: 'mutation { emoteSets { emoteSet(id: "S") { addEmote(id: { emoteId: "E", alias: "peepoHappy" }) { id } } } }' },
    ]);
  });

  it('keeps any spelling intact, quotes included', async () => {
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => answers(1));
    await createWriter('tok', { fetchFn, ...fast }).removeEmote('S', 'E', 'say "hi" üäö');
    expect(body(fetchFn.mock.calls[0]![1])[0].query).toContain('alias: "say \\"hi\\" üäö"');
  });

  it('sends 30 changes per request and reports each one', async () => {
    const refused = new Response(JSON.stringify({ errors: [{ message: 'Emote already in set' }] }));
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
      String(url).endsWith('/v4/gql')
        ? answers(body(init).length, (i) => (body(init)[i].query.includes('"E1"') ? 'Emote already in set' : undefined))
        : refused.clone(),
    );
    const emotes = Array.from({ length: 31 }, (_, i) => ({ emoteId: `E${i}`, alias: `e${i}` }));
    const results = await createWriter('tok', { fetchFn, ...fast }).addEmotes('S', emotes);
    // Two batches, plus the refused emote sent again on its own over v4 and over v3.
    expect(fetchFn.mock.calls.map(([url, init]) => [String(url).slice(-6), Array.isArray(body(init as RequestInit)) ? body(init as RequestInit).length : 1])).toEqual([
      ['v4/gql', 30],
      ['v4/gql', 1],
      ['v3/gql', 1],
      ['v4/gql', 1],
    ]);
    expect(results).toHaveLength(31);
    expect(results[1]).toMatchObject({ ok: false, error: { kind: 'refused', message: 'Emote already in set' } });
    expect(results.filter((r) => r.ok)).toHaveLength(30);
  });

  it('backs off and retries a rate-limited batch', async () => {
    const waits: number[] = [];
    const limited = () => new Response(JSON.stringify({ errors: [{ message: 'Rate limit reached' }] }), { status: 429 });
    const fetchFn = vi.fn().mockResolvedValueOnce(limited()).mockResolvedValueOnce(limited()).mockResolvedValue(answers(1));
    await createWriter('tok', { fetchFn, pauseMs: 0, sleep: async (ms) => void waits.push(ms) }).removeEmote('S', 'E', 'a');
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([1000, 2000]);
  });

  it('falls back to one v3 request per emote when v4 can’t run the batch', async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) =>
      String(url).endsWith('/v4/gql')
        ? answers(2, () => 'Unknown field "addEmote" on type "EmoteSetOperation"')
        : new Response(JSON.stringify({ data: { emoteSet: { emotes: [] } } })),
    );
    const writer = createWriter('tok', { fetchFn, ...fast });
    const results = await writer.addEmotes('S', [
      { emoteId: 'A', alias: 'a' },
      { emoteId: 'B', alias: 'b' },
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    const v3 = fetchFn.mock.calls.filter(([url]) => String(url).endsWith('/v3/gql'));
    expect(v3.map(([, init]) => body(init as RequestInit).variables)).toEqual([
      { id: 'S', action: 'ADD', emote_id: 'A', name: 'a' },
      { id: 'S', action: 'ADD', emote_id: 'B', name: 'b' },
    ]);
    // Once v4 has said no, the writer doesn't ask it again.
    await writer.addEmote('S', 'C', 'c');
    expect(fetchFn.mock.calls.filter(([url]) => String(url).endsWith('/v4/gql'))).toHaveLength(1);
  });

  it('retries an emote whose save 7TV couldn’t finish, on its own', async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
      String(url).endsWith('/v4/gql')
        ? answers(body(init).length, (i) => (i === 1 ? 'TRANSACTION_ERROR transaction failed' : undefined))
        : new Response(JSON.stringify({ data: { emoteSet: { emotes: [] } } })),
    );
    const results = await createWriter('tok', { fetchFn, ...fast }).addEmotes('S', [
      { emoteId: 'A', alias: 'a' },
      { emoteId: 'B', alias: 'Wankge' },
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    const v3 = fetchFn.mock.calls.filter(([url]) => String(url).endsWith('/v3/gql'));
    expect(v3.map(([, init]) => body(init as RequestInit).variables)).toEqual([
      { id: 'S', action: 'ADD', emote_id: 'B', name: 'Wankge' },
    ]);
  });

  it('backs off on a failed save, and doesn’t call it a refused name if it never goes through', async () => {
    const waits: number[] = [];
    const failed = () => new Response(JSON.stringify({ errors: [{ message: 'TRANSACTION_ERROR transaction failed' }] }));
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
      String(url).endsWith('/v4/gql') ? answers(body(init).length, () => 'TRANSACTION_ERROR transaction failed') : failed(),
    );
    const error = await createWriter('tok', { fetchFn, pauseMs: 0, sleep: async (ms) => void waits.push(ms) })
      .addEmote('S', 'E', 'Wankge')
      .catch((e) => e);
    expect(error).toMatchObject({ kind: 'conflict' });
    expect(waits).toEqual([1000, 1000, 2000, 4000, 8000]);
  });

  it.each(['Weißwurst', 'Grüße', 'Käse', 'Öl', 'café'])('sends a refused %s again on its own, since 7TV takes it the next time', async (alias) => {
    let requests = 0;
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const first = requests++ === 0;
      return answers(body(init).length, (i) =>
        first && body(init)[i].query.includes(alias) ? 'failed string' : undefined,
      );
    });
    const results = await createWriter('tok', { fetchFn, ...fast }).addEmotes('S', [
      { emoteId: 'A', alias: 'a' },
      { emoteId: 'B', alias },
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(fetchFn.mock.calls.map(([url, init]) => [String(url), body(init as RequestInit).length])).toEqual([
      ['https://7tv.io/v4/gql', 2],
      ['https://7tv.io/v4/gql', 1],
    ]);
  });

  it('tries a refused name once more on v4 and once on v3 before calling it refused', async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
      String(url).endsWith('/v4/gql')
        ? answers(body(init).length, () => 'Emote already enabled')
        : new Response(JSON.stringify({ errors: [{ message: 'Emote already enabled' }] })),
    );
    const error = await createWriter('tok', { fetchFn, ...fast }).addEmote('S', 'E', 'a').catch((e) => e);
    expect(error).toBeInstanceOf(WriteError);
    expect(error).toMatchObject({ kind: 'refused', message: 'Emote already enabled' });
    expect(fetchFn.mock.calls.map(([url]) => String(url))).toEqual([
      'https://7tv.io/v4/gql',
      'https://7tv.io/v4/gql',
      'https://7tv.io/v3/gql',
    ]);
    expect(body(fetchFn.mock.calls[2]![1] as RequestInit).variables).toEqual({ id: 'S', action: 'ADD', emote_id: 'E', name: 'a' });
  });

  it('takes a name v3 accepts after v4 refused it', async () => {
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) =>
      String(url).endsWith('/v4/gql') ? answers(body(init).length, () => 'failed string') : ok(),
    );
    await expect(createWriter('tok', { fetchFn, ...fast }).addEmote('S', 'E', 'Grüße')).resolves.toBeUndefined();
    expect(fetchFn.mock.calls.map(([url]) => String(url)).at(-1)).toBe('https://7tv.io/v3/gql');
  });

  it('doesn’t send a refused removal again', async () => {
    const fetchFn = vi.fn(async () => answers(1, () => 'Emote not in set'));
    await expect(createWriter('tok', { fetchFn, ...fast }).removeEmote('S', 'E', 'a')).rejects.toMatchObject({ kind: 'refused' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('recognises a rejected token', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: 'Unauthorized' }] }), { status: 401 }));
    await expect(createWriter('bad', { fetchFn, ...fast }).deleteSet('S')).rejects.toMatchObject({ kind: 'auth' });
  });
});

it('recognises 7TV’s invalid-session answer and says how to get a fresh token', async () => {
  const fetchFn = vi.fn(
    async () => new Response(JSON.stringify({ status: 'Unauthorized', error_code: 1000, error: 'invalid session' }), { status: 401 }),
  );
  const error = await createWriter('old', { fetchFn, sleep: async () => {} }).addEmote('S', 'E', 'STEPPIES').catch((e) => e);
  expect(error).toMatchObject({ kind: 'auth' });
  expect(error.message).toMatch(/Log out of 7tv\.app and log back in/);
  expect(fetchFn).toHaveBeenCalledTimes(1);
});

describe('suggestAlias', () => {
  it.each([
    ['a,b', 'ab'],
    ['peepo happy', 'peepohappy'],
    ['müted', 'müted_'],
    [',', 'emote'],
  ])('%s → %s', (alias, result) => expect(suggestAlias(alias)).toBe(result));
});
