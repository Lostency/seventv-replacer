import { describe, expect, it, vi } from 'vitest';
import { transliterate } from './alias';
import { createWriter, WriteError } from './seventv-write';

const ok = () => new Response(JSON.stringify({ data: { emoteSet: { emotes: [] } } }));
const limited = () => new Response(JSON.stringify({ errors: [{ message: 'Rate limit reached' }] }), { status: 429 });

describe('createWriter', () => {
  it('sends the token to 7TV only', async () => {
    const fetchFn = vi.fn(async () => ok());
    await createWriter('tok', { fetchFn }).addEmote('S', 'E', 'peepoHappy');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://7tv.io/v3/gql');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string).variables).toEqual({ id: 'S', action: 'ADD', emote_id: 'E', name: 'peepoHappy' });
  });

  it('backs off and retries when rate-limited', async () => {
    const waits: number[] = [];
    const fetchFn = vi.fn().mockResolvedValueOnce(limited()).mockResolvedValueOnce(limited()).mockResolvedValue(ok());
    await createWriter('tok', { fetchFn, sleep: async (ms) => void waits.push(ms) }).removeEmote('S', 'E');
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([1000, 2000]);
  });

  it('does not retry a refusal', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: 'Emote already enabled' }] })));
    const error = await createWriter('tok', { fetchFn }).addEmote('S', 'E', 'a').catch((e) => e);
    expect(error).toBeInstanceOf(WriteError);
    expect(error).toMatchObject({ kind: 'refused', message: 'Emote already enabled' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('recognises a rejected token', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: 'Unauthorized' }] }), { status: 401 }));
    await expect(createWriter('bad', { fetchFn }).deleteSet('S')).rejects.toMatchObject({ kind: 'auth' });
  });
});

it('recognises 7TV’s invalid-session answer and says how to get a fresh token', async () => {
  const fetchFn = vi.fn(
    async () => new Response(JSON.stringify({ status: 'Unauthorized', error_code: 1000, error: 'invalid session' }), { status: 401 }),
  );
  const error = await createWriter('old', { fetchFn }).addEmote('S', 'E', 'STEPPIES').catch((e) => e);
  expect(error).toMatchObject({ kind: 'auth' });
  expect(error.message).toMatch(/Log out of 7tv\.app and log back in/);
  expect(fetchFn).toHaveBeenCalledTimes(1);
});

describe('transliterate', () => {
  it.each([
    ['Grüße', 'Gruesse'],
    ['ÄÖÜ', 'AeOeUe'],
    ['café', 'cafe'],
    ['peepo happy!', 'peepohappy'],
    ['ok_name', null],
    ['❤', null],
  ])('%s → %s', (alias, result) => expect(transliterate(alias)).toBe(result));
});
