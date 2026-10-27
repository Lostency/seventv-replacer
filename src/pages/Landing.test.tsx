import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentPath, json, mockFetch, mockReducedMotion, renderAt } from '../test/render';

const id = (n: number, prefix: string) => `${prefix}${String(n).padStart(25, '0')}`;
const preset = (season: string) =>
  json({
    season,
    mappings: Array.from({ length: 30 }, (_, i) => ({ originalId: id(i, 'O'), replacementId: id(i, 'R') })),
  });
const stats = () => json({ mappings: { halloween: 275, winter: 568 } });

describe('Landing', () => {
  beforeEach(() => {
    mockFetch({ '/api/stats': stats, '/api/presets/halloween': () => preset('halloween'), '/api/presets/winter': () => preset('winter') });
  });

  it('leads with the headline', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('One key makes your set seasonal.');
  });

  it('stops an empty submit at the channel field', async () => {
    renderAt('/');
    await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));
    expect(screen.getByLabelText('Your Twitch channel')).toHaveFocus();
    expect(screen.getByText('Type your channel name first.')).toBeInTheDocument();
    expect(currentPath()).toBe('/');
  });

  it('sends the channel and season to Replace', async () => {
    renderAt('/');
    await userEvent.type(screen.getByLabelText('Your Twitch channel'), 'niena');
    await userEvent.click(screen.getByRole('radio', { name: 'Winter' }));
    await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));
    expect(currentPath()).toBe('/replace?channel=niena&season=winter');
  });

  it('shows the live mapping count once a season has flipped', async () => {
    mockReducedMotion(true);
    renderAt('/');
    await userEvent.click(screen.getByRole('radio', { name: 'Winter' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Winter · 568 mappings'));
  });

  it('hides counts when stats fail', async () => {
    mockFetch({ '/api/presets/': (url) => preset(url.split('/').pop()!) });
    mockReducedMotion(true);
    renderAt('/');
    await userEvent.click(screen.getByRole('radio', { name: 'Halloween' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/^Halloween$/));
    expect(screen.getByRole('status')).not.toHaveTextContent(/\d|NaN/);
  });

  it('skips the auto-turn under reduced motion', async () => {
    mockReducedMotion(true);
    renderAt('/');
    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(24));
    await act(() => new Promise((resolve) => setTimeout(resolve, 1200)));
    expect(screen.getByRole('radio', { name: 'Normal' })).toBeChecked();
  });

  it('turns to the current season on its own', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-01T12:00:00'));
    renderAt('/');
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Winter' })).toBeChecked(), { timeout: 3000 });
  });

  it('keeps working when the preset cannot load', async () => {
    mockFetch({ '/api/stats': stats });
    renderAt('/');
    await userEvent.type(screen.getByLabelText('Your Twitch channel'), 'niena');
    await userEvent.click(screen.getByRole('button', { name: /make seasonal/i }));
    expect(currentPath()).toMatch(/^\/replace\?channel=niena&season=(halloween|winter)$/);
  });

  it('credits niena and disclaims 7TV', () => {
    renderAt('/');
    expect(screen.getAllByRole('link', { name: /niena/i })[0]).toHaveAttribute('href', 'https://twitch.tv/niena');
    expect(screen.getByText('Not affiliated with 7TV.')).toBeInTheDocument();
  });
});
