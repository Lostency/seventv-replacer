import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { json, mockFetch, renderAt } from '../test/render';
import { emoteId, SET_ID, sevenTvRead } from '../test/seventv-mock';

const A = emoteId(1, 'A');
const B = emoteId(2, 'B');
const X = emoteId(3, 'X');
const A2 = emoteId(1, 'R');
const B2 = emoteId(2, 'R');

const preset = (season: string) => json({ season, mappings: [{ originalId: A, replacementId: A2 }, { originalId: B, replacementId: B2 }] });

let sets: Record<string, { name: string; emotes: Array<[string, string]> }>;
let mutations: Array<Record<string, unknown>>;

function setUp() {
  sets = { [SET_ID]: { name: 'Main', emotes: [['peepoHappy', A], ['Sadge', B], ['KEKW', X]] } };
  mutations = [];
  return mockFetch({
    ...sevenTvRead(sets),
    '/api/presets/': (url) => preset(url.split('/').pop()!),
    'https://7tv.io/v3/gql': (_url, init) => {
      const { variables } = JSON.parse(String(init?.body));
      mutations.push(variables);
      return json({ data: { emoteSet: { emotes: [] } } });
    },
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
    expect(screen.getByLabelText('7TV token')).toHaveFocus();
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
    await userEvent.type(screen.getByLabelText('7TV token'), 'tok');
    await pickMain();
    await userEvent.click(screen.getByRole('radio', { name: 'In place' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sadge' }));
    await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));

    await screen.findByRole('heading', { name: 'Run finished' }, { timeout: 4000 });
    expect(mutations).toEqual([
      { id: SET_ID, action: 'REMOVE', emote_id: A },
      { id: SET_ID, action: 'ADD', emote_id: A2, name: 'peepoHappy' },
    ]);
    expect(screen.getByText(/1 emote swapped in “Main”/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('ser.runs')!)).toHaveLength(1);
    expect(localStorage.getItem('ser.7tv-token')).toBe('tok');
  });

  it('undoes a run, skipping nothing when the set is as the run left it', async () => {
    renderAt('/replace?channel=niena&season=halloween');
    await userEvent.type(screen.getByLabelText('7TV token'), 'tok');
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
      { id: SET_ID, action: 'REMOVE', emote_id: A2 },
      { id: SET_ID, action: 'ADD', emote_id: A, name: 'peepoHappy' },
    ]);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('tells the user to log in to 7TV again when the token is rejected', async () => {
    setUp();
    mockFetch({
      ...sevenTvRead(sets),
      '/api/presets/': (url) => preset(url.split('/').pop()!),
      'https://7tv.io/v3/gql': () => json({ status: 'Unauthorized', error_code: 1000, error: 'invalid session' }, 401),
    });
    renderAt('/replace?channel=niena&season=halloween');
    await userEvent.type(screen.getByLabelText('7TV token'), 'old');
    await pickMain();
    await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Log out of 7tv.app and log back in');
  });
});
