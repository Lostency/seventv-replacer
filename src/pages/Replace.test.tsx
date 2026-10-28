import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { json, mockFetch, renderAt } from '../test/render';
import { emoteId, SET_ID, sevenTvRead, type Mutation } from '../test/seventv-mock';

const A = emoteId(1, 'A');
const B = emoteId(2, 'B');
const X = emoteId(3, 'X');
const A2 = emoteId(1, 'R');
const B2 = emoteId(2, 'R');

const preset = (season: string) => json({ season, mappings: [{ originalId: A, replacementId: A2 }, { originalId: B, replacementId: B2 }] });

let sets: Record<string, { name: string; emotes: Array<[string, string]> }>;
let mutations: Mutation[];

function setUp() {
  sets = { [SET_ID]: { name: 'Main', emotes: [['peepoHappy', A], ['Sadge', B], ['KEKW', X]] } };
  mutations = [];
  return mockFetch({
    ...sevenTvRead(sets, (change) => void mutations.push(change)),
    '/api/presets/': (url) => preset(url.split('/').pop()!),
  });
}

async function pickMain() {
  await userEvent.click(await screen.findByRole('button', { name: /Main/ }));
  await screen.findByRole('list', { name: 'Swaps' });
}

describe('Replace', () => {
  beforeEach(() => {
    localStorage.clear();
    setUp();
  });

  it('picks up the channel and season from the landing page', async () => {
    renderAt('/replace?channel=niena&season=winter');
    expect(screen.getByRole('radio', { name: 'Winter' })).toBeChecked();
    expect(await screen.findByRole('button', { name: /Main/ })).toBeInTheDocument();
    expect(screen.getByText('niena’s sets on 7TV')).toBeInTheDocument();
  });

  it('previews every swap, all ticked, and sums up emotes without a seasonal version', async () => {
    renderAt('/replace?channel=niena&season=halloween');
    await pickMain();
    const rows = within(screen.getByRole('list', { name: 'Swaps' })).getAllByRole('checkbox');
    expect(rows).toHaveLength(2);
    rows.forEach((box) => expect(box).toBeChecked());
    expect(screen.getByText(/1 emote has no Halloween version yet/)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Halloween · 2 swaps');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sadge' }));
    expect(screen.getByRole('status')).toHaveTextContent('Halloween · 1 swap');
  });

  it('asks for the token before running', async () => {
    renderAt('/replace?channel=niena');
    await pickMain();
    await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));
    expect(screen.getByLabelText('7TV token', { exact: true })).toHaveFocus();
    expect(screen.getByText('Paste your 7TV token first.')).toBeInTheDocument();
    expect(mutations).toEqual([]);
  });

  it('suggests a name for the copy', async () => {
    renderAt('/replace?channel=niena&season=winter');
    await pickMain();
    expect(screen.getByLabelText('Name of the new set')).toHaveValue('Main (Winter)');
  });

  it('warns before replacing in place', async () => {
    renderAt('/replace?season=halloween');
    await userEvent.click(screen.getByRole('radio', { name: 'In place' }));
    expect(
      screen.getByText(
        /Revert uses the Halloween preset in reverse and may not restore every emote exactly\. Undo restores it exactly, but only from this browser\./,
      ),
    ).toBeInTheDocument();
  });

  it('swaps in place keeping aliases, then offers Undo for the run', async () => {
    renderAt('/replace?channel=niena&season=halloween');
    await userEvent.type(screen.getByLabelText('7TV token', { exact: true }), 'tok');
    await pickMain();
    await userEvent.click(screen.getByRole('radio', { name: 'In place' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sadge' }));
    await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));

    await screen.findByRole('heading', { name: 'Run finished' }, { timeout: 4000 });
    expect(mutations).toEqual([
      { id: SET_ID, action: 'REMOVE', emote_id: A, name: 'peepoHappy' },
      { id: SET_ID, action: 'ADD', emote_id: A2, name: 'peepoHappy' },
    ]);
    expect(screen.getByText(/1 emote swapped in “Main”/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('ser.runs')!)).toHaveLength(1);
    expect(localStorage.getItem('ser.7tv-token')).toBe('tok');
  });

  it('undoes a run, skipping nothing when the set is as the run left it', async () => {
    renderAt('/replace?channel=niena&season=halloween');
    await userEvent.type(screen.getByLabelText('7TV token', { exact: true }), 'tok');
    await pickMain();
    await userEvent.click(screen.getByRole('radio', { name: 'In place' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sadge' }));
    await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));
    await screen.findByRole('heading', { name: 'Run finished' }, { timeout: 4000 });

    sets[SET_ID]!.emotes = [['peepoHappy', A2], ['Sadge', B], ['KEKW', X]];
    mutations.length = 0;
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await screen.findByText('Put back 1 emote in “Main”.', {}, { timeout: 4000 });
    expect(mutations).toEqual([
      { id: SET_ID, action: 'REMOVE', emote_id: A2, name: 'peepoHappy' },
      { id: SET_ID, action: 'ADD', emote_id: A, name: 'peepoHappy' },
    ]);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('tells the user to log in to 7TV again when the token is rejected', async () => {
    setUp();
    const rejected = () => json({ status: 'Unauthorized', error_code: 1000, error: 'invalid session' }, 401);
    const read = sevenTvRead(sets);
    mockFetch({
      ...read,
      'https://7tv.io/v3/gql': rejected,
      'https://7tv.io/v4/gql': (url, init) =>
        Array.isArray(JSON.parse(String(init?.body))) ? rejected() : read['https://7tv.io/v4/gql'](url, init),
      '/api/presets/': (url) => preset(url.split('/').pop()!),
    });
    renderAt('/replace?channel=niena&season=halloween');
    await userEvent.type(screen.getByLabelText('7TV token', { exact: true }), 'old');
    await pickMain();
    await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Log out of 7tv.app and log back in');
  });

  it('carries on past a refused name, lists it under Problems, and retries it with a new name', async () => {
    sets[SET_ID]!.emotes = [['a,b', A], ['KEKW', X]];
    mockFetch({
      ...sevenTvRead(sets, (change) => {
        mutations.push(change);
        return change.name?.includes(',') ? 'Invalid emote name' : undefined;
      }),
      '/api/presets/': (url) => preset(url.split('/').pop()!),
    });
    renderAt('/replace?channel=niena&season=halloween');
    await userEvent.type(screen.getByLabelText('7TV token', { exact: true }), 'tok');
    await pickMain();
    await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));

    await screen.findByRole('heading', { name: 'Run finished' }, { timeout: 4000 });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByText('a,b was set aside. The run carries on.')).toBeInTheDocument();
    const problems = screen.getByRole('region', { name: 'Problems' });
    expect(within(problems).getByText(/Invalid emote name/)).toBeInTheDocument();
    expect(within(problems).getByLabelText('New name for a,b')).toHaveValue('ab');
    expect(JSON.parse(localStorage.getItem('ser.problems')!)).toHaveLength(1);

    sets.NEW = { name: 'Main (Halloween)', emotes: [['KEKW', X]] };
    mutations.length = 0;
    await userEvent.click(within(problems).getByRole('button', { name: 'Retry a,b' }));
    await screen.findByText('a,b is in as “ab”.', {}, { timeout: 4000 });
    expect(mutations).toEqual([{ id: 'NEW', action: 'ADD', emote_id: A2, name: 'ab' }]);
    expect(screen.queryByRole('region', { name: 'Problems' })).not.toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('ser.problems')!)).toEqual([]);
  });

  it('takes a fix made during the run, and Undo knows about it', async () => {
    sets[SET_ID]!.emotes = [['a,b', A], ['Sadge', B]];
    mockFetch({
      ...sevenTvRead(sets, (change) => {
        mutations.push(change);
        // Taking "a,b" out works; putting anything in under it doesn't.
        return change.action === 'ADD' && change.name?.includes(',') ? 'Invalid emote name' : undefined;
      }),
      '/api/presets/': (url) => preset(url.split('/').pop()!),
    });
    renderAt('/replace?channel=niena&season=halloween');
    await userEvent.type(screen.getByLabelText('7TV token', { exact: true }), 'tok');
    await pickMain();
    await userEvent.click(screen.getByRole('radio', { name: 'In place' }));
    await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));

    const problems = await screen.findByRole('region', { name: 'Problems' }, { timeout: 4000 });
    // 7TV took neither version under "a,b": the set is short it until the fix.
    sets[SET_ID]!.emotes = [['Sadge', B2]];
    await userEvent.click(within(problems).getByRole('button', { name: 'Retry a,b' }));
    await screen.findByRole('heading', { name: 'Run finished' }, { timeout: 4000 });
    await screen.findByText('a,b is in as “ab”.', {}, { timeout: 4000 });
    expect(mutations).toContainEqual({ id: SET_ID, action: 'ADD', emote_id: A2, name: 'ab' });
    expect(JSON.parse(localStorage.getItem('ser.runs')!)[0].swaps).toContainEqual({
      fromId: A,
      toId: A2,
      alias: 'ab',
      originalAlias: 'a,b',
    });
  });

  it('tells the admins about a broken seasonal emote, and lets the user dismiss it', async () => {
    const reports: unknown[] = [];
    mockFetch({
      ...sevenTvRead(sets, (change) => (change.emote_id === A2 ? 'Unknown Emote' : undefined)),
      'https://7tv.io/v3/emotes/': () => json({ error: 'emote not found' }, 404),
      '/api/broken-emotes': (_url, init) => {
        reports.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 202 });
      },
      '/api/presets/': (url) => preset(url.split('/').pop()!),
    });
    renderAt('/replace?channel=niena&season=halloween');
    await userEvent.type(screen.getByLabelText('7TV token', { exact: true }), 'tok');
    await pickMain();
    await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));
    await screen.findByRole('heading', { name: 'Run finished' }, { timeout: 4000 });

    expect(reports).toEqual([{ season: 'halloween', originalId: A, replacementId: A2, brokenId: A2, reason: 'Unknown Emote' }]);
    const problems = screen.getByRole('region', { name: 'Problems' });
    expect(within(problems).getByText(/gone or unusable on 7TV/)).toBeInTheDocument();
    expect(within(problems).queryByRole('button', { name: 'Retry peepoHappy' })).not.toBeInTheDocument();
    await userEvent.click(within(problems).getByRole('button', { name: 'Dismiss peepoHappy' }));
    expect(screen.queryByRole('region', { name: 'Problems' })).not.toBeInTheDocument();
  });

  it('keeps problems from an earlier visit until they are dealt with', async () => {
    localStorage.setItem(
      'ser.problems',
      JSON.stringify([
        {
          id: 'P1',
          runId: 'R1',
          kind: 'refused',
          mode: 'in-place',
          season: 'halloween',
          setId: SET_ID,
          setName: 'Main',
          alias: 'a,b',
          emoteId: A2,
          normalId: A,
          pairing: { originalId: A, replacementId: A2 },
          reason: 'Invalid emote name',
          at: '2026-10-28T12:00:00.000Z',
        },
      ]),
    );
    renderAt('/replace');
    const problems = screen.getByRole('region', { name: 'Problems' });
    expect(within(problems).getByText('Main')).toBeInTheDocument();
    expect(within(problems).getByLabelText('New name for a,b')).toBeInTheDocument();
  });

  it('keeps names with umlauts and accents as they are', async () => {
    sets[SET_ID]!.emotes = [['üäöéèà', A]];
    renderAt('/replace?channel=niena&season=halloween');
    await userEvent.type(screen.getByLabelText('7TV token', { exact: true }), 'tok');
    await pickMain();
    await userEvent.click(screen.getByRole('radio', { name: 'In place' }));
    await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));
    await screen.findByRole('heading', { name: 'Run finished' }, { timeout: 4000 });
    expect(mutations).toContainEqual({ id: SET_ID, action: 'ADD', emote_id: A2, name: 'üäöéèà' });
  });

  it('estimates the time left once a few emotes are done', async () => {
    sets[SET_ID]!.emotes = Array.from({ length: 61 }, (_, i) => [`e${i}`, emoteId(i + 10, 'E')] as [string, string]);
    renderAt('/replace?channel=niena&season=halloween');
    await userEvent.type(screen.getByLabelText('7TV token', { exact: true }), 'tok');
    await userEvent.click(await screen.findByRole('button', { name: /Main/ }));
    await screen.findByText(/no Halloween version yet/);
    await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Copying · \d+\/61 · under 1 min left/), {
      timeout: 4000,
    });
  });

  it('saves the run for Undo while it is still going', async () => {
    sets[SET_ID]!.emotes = Array.from({ length: 31 }, (_, i) => [`e${i}`, emoteId(i + 10, 'E')] as [string, string]);
    renderAt('/replace?channel=niena&season=halloween');
    await userEvent.type(screen.getByLabelText('7TV token', { exact: true }), 'tok');
    await userEvent.click(await screen.findByRole('button', { name: /Main/ }));
    await screen.findByText(/no Halloween version yet/);
    await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));
    // 30 emotes per request: halfway through, the first batch is in and the second isn't.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/Copying · 30\/31/), { timeout: 4000 });
    expect(JSON.parse(localStorage.getItem('ser.runs')!)[0]).toMatchObject({ createdSet: true });
    await screen.findByRole('heading', { name: 'Run finished' }, { timeout: 6000 });
  });
});
