import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { json, mockFetch, renderAt } from '../test/render';
import { SEASONAL_ID, SET_ID, sevenTvRead } from '../test/seventv-mock';

const signedIn = { user: { login: 'viewer', displayName: 'Viewer', admin: false }, signInAvailable: true };
const sets = {
  [SET_ID]: { name: 'Main', emotes: [] as Array<[string, string]> },
  [SEASONAL_ID]: { name: 'Spooky', emotes: [] as Array<[string, string]> },
};
const preview = (cooldown: unknown = null) => ({
  normal: { id: SET_ID, name: 'Main', owner: 'niena' },
  seasonal: { id: SEASONAL_ID, name: 'Spooky', owner: 'niena' },
  channel: 'niena',
  matches: [
    { alias: 'peepoHappy', originalId: 'A', replacementId: 'A2' },
    { alias: 'Sadge', originalId: 'B', replacementId: 'B2' },
  ],
  cooldown,
});

async function pickBoth() {
  const [normalField, seasonalField] = screen.getAllByLabelText('Channel name or 7TV set link');
  await userEvent.type(normalField!, `https://7tv.app/emote-sets/${SET_ID}{Enter}`);
  await userEvent.type(seasonalField!, `${SEASONAL_ID}{Enter}`);
  return screen.findByRole('list', { name: 'Matches' });
}

describe('Compare', () => {
  it('asks a visitor to sign in with Twitch', async () => {
    mockFetch({ '/api/me': () => json({ user: null, signInAvailable: true }) });
    renderAt('/compare');
    const link = await screen.findByRole('link', { name: /sign in with twitch/i });
    expect(link).toHaveAttribute('href', '/api/auth/login?return=%2Fcompare');
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
  });

  it('explains a cancelled sign-in', async () => {
    mockFetch({ '/api/me': () => json({ user: null, signInAvailable: true }) });
    renderAt('/compare?signin=cancelled');
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in was cancelled');
  });

  it('says so when sign-in is not set up', async () => {
    mockFetch({ '/api/me': () => json({ user: null, signInAvailable: false }) });
    renderAt('/compare');
    expect(await screen.findByText(/sign-in isn’t set up on this server yet/)).toBeInTheDocument();
  });

  it('sends only the set IDs, the season and the unticked pairs', async () => {
    const bodies: unknown[] = [];
    mockFetch({
      ...sevenTvRead(sets),
      '/api/me': () => json(signedIn),
      '/api/comparisons/preview': () => json(preview()),
      '/api/comparisons': (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return json({ channel: 'niena', sightings: 1, cooldown: { comparedOn: '2026-10-27T12:00:00Z', availableFrom: '2026-11-10T12:00:00Z' } }, 201);
      },
    });
    renderAt('/compare');
    await screen.findByText(/Signed in as Viewer/);
    const list = await pickBoth();
    expect(within(list).getAllByRole('checkbox')).toHaveLength(2);
    await userEvent.click(screen.getByRole('radio', { name: 'Winter' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sadge' }));
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText(/1 swap recorded for niena/)).toBeInTheDocument();
    expect(bodies).toEqual([
      { normalSetId: SET_ID, seasonalSetId: SEASONAL_ID, season: 'winter', excluded: [{ originalId: 'B', replacementId: 'B2' }] },
    ]);
    expect(screen.getByText(/can be compared again from Nov 10, 2026/)).toBeInTheDocument();
  });

  it('shows when a pair was compared recently', async () => {
    mockFetch({
      ...sevenTvRead(sets),
      '/api/me': () => json(signedIn),
      '/api/comparisons/preview': () =>
        json(preview({ comparedOn: '2026-10-20T12:00:00Z', availableFrom: '2026-11-03T12:00:00Z' })),
    });
    renderAt('/compare');
    await screen.findByText(/Signed in as Viewer/);
    await pickBoth();
    expect(screen.getByText('Compared on Oct 20, 2026, can be compared again from Nov 3, 2026.')).toBeInTheDocument();
  });
});
