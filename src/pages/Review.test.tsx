import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminMapping, Candidate } from '@shared/types';
import { json, mockFetch, renderAt } from '../test/render';

const admin = { user: { login: 'niena', displayName: 'niena', admin: true }, signInAvailable: true };
const viewer = { user: { login: 'viewer', displayName: 'Viewer', admin: false }, signInAvailable: true };

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  originalId: 'O1',
  replacementId: 'R1',
  alias: 'peepoHappy',
  channels: 3,
  current: null,
  ...overrides,
});

type Call = { method: string; url: string; body?: unknown };

/** An admin's server: the queue answers `queue()` each time, writes are recorded. */
function adminServer(
  queue: () => Candidate[],
  answers: { mapping?: unknown; mappings?: () => AdminMapping[]; deleted?: AdminMapping } = {},
) {
  const calls: Call[] = [];
  const record = (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method !== 'GET') calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return method;
  };
  mockFetch({
    '/api/me': () => json(admin),
    '/api/admin/review/': (url, init) => {
      record(url, init);
      return json({ season: url.split('/').pop(), threshold: 2, candidates: queue() });
    },
    '/api/admin/mappings/': (url, init) => {
      const method = record(url, init);
      return method === 'DELETE'
        ? json({ deleted: answers.deleted ?? null })
        : json({ season: 'halloween', mappings: answers.mappings?.() ?? [] });
    },
    '/api/admin/mappings': (url, init) => {
      record(url, init);
      return json(answers.mapping ?? { previous: null });
    },
    '/api/admin/rejections': (url, init) => {
      const method = record(url, init);
      return method === 'DELETE' ? new Response(null, { status: 204 }) : json({}, 201);
    },
    '/api/admin/threshold': (url, init) => {
      record(url, init);
      return json({ threshold: 3 });
    },
  });
  return calls;
}

describe('Review', () => {
  it('asks a visitor to sign in, returning to /review', async () => {
    mockFetch({ '/api/me': () => json({ user: null, signInAvailable: true }) });
    renderAt('/review');
    const link = await screen.findByRole('link', { name: /sign in with twitch/i });
    expect(link).toHaveAttribute('href', '/api/auth/login?return=%2Freview');
  });

  it('tells a signed-in non-admin that review is for admins', async () => {
    mockFetch({ '/api/me': () => json(viewer) });
    renderAt('/review');
    expect(await screen.findByText('Review is for admins.')).toBeInTheDocument();
    expect(screen.getByText(/signed in as Viewer/)).toBeInTheDocument();
  });

  it('shows each candidate with how many channels made the swap', async () => {
    adminServer(() => [candidate(), candidate({ originalId: 'O2', replacementId: 'R2', alias: 'Sadge', channels: 1 })]);
    renderAt('/review');
    expect(await screen.findByText('peepoHappy → peepoHappy · seen in 3 channels')).toBeInTheDocument();
    expect(screen.getByText('Sadge → Sadge · seen in 1 channel')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Reject' })).toHaveLength(2);
  });

  it('says when nothing is waiting', async () => {
    adminServer(() => []);
    renderAt('/review');
    expect(await screen.findByText('Nothing is waiting for review in Halloween.')).toBeInTheDocument();
  });

  it('accepts, then Undo removes the mapping again', async () => {
    let queue = [candidate()];
    const calls = adminServer(() => queue);
    renderAt('/review');
    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    queue = [];
    expect(await screen.findByText('Accepted peepoHappy.')).toBeInTheDocument();
    expect(calls).toContainEqual({
      method: 'PUT',
      url: '/api/admin/mappings',
      body: { season: 'halloween', originalId: 'O1', replacementId: 'R1', source: 'review' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(calls).toContainEqual({ method: 'DELETE', url: '/api/admin/mappings/halloween/O1', body: undefined });
  });

  it('offers Replace existing, and Undo puts the old mapping back', async () => {
    const previous = { originalId: 'O1', replacementId: 'RX', source: 'seed', createdAt: '2026-10-27 12:00:00' };
    const calls = adminServer(() => [candidate({ current: 'RX' })], { mapping: { previous } });
    renderAt('/review');
    expect(await screen.findByText('Now mapped to')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Replace existing' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(calls.at(-1)).toEqual({
      method: 'PUT',
      url: '/api/admin/mappings',
      body: { season: 'halloween', originalId: 'O1', replacementId: 'RX', source: 'seed' },
    });
  });

  it('rejects, and Undo lifts the rejection', async () => {
    const calls = adminServer(() => [candidate()]);
    renderAt('/review');
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Rejected peepoHappy.')).toBeInTheDocument();
    expect(calls).toContainEqual({
      method: 'POST',
      url: '/api/admin/rejections',
      body: { season: 'halloween', originalId: 'O1', replacementId: 'R1' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(calls).toContainEqual({ method: 'DELETE', url: '/api/admin/rejections/halloween/O1/R1', body: undefined });
  });

  it('saves the threshold, and refuses one outside 1 to 50', async () => {
    const calls = adminServer(() => []);
    renderAt('/review');
    const field = await screen.findByLabelText('Channels needed');
    await waitFor(() => expect(field).toHaveValue('2'));
    await userEvent.clear(field);
    await userEvent.type(field, '0');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Use a whole number from 1 to 50.')).toBeInTheDocument();
    expect(calls.filter((c) => c.url === '/api/admin/threshold')).toEqual([]);

    await userEvent.clear(field);
    await userEvent.type(field, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Saved. Pairings need 3 channels.');
    expect(calls).toContainEqual({ method: 'PUT', url: '/api/admin/threshold', body: { threshold: 3 } });
  });
});

const A = '01F6MDFCSR0000WDA7ERT623YT';
const B = '01F6MDFYC80005TFYTWP1XJFSM';
const row = (originalId: string, replacementId: string, source: AdminMapping['source'] = 'seed'): AdminMapping => ({
  originalId,
  replacementId,
  source,
  createdAt: '2026-10-27 12:00:00',
});

describe('Review: the preset', () => {
  afterEach(() => vi.restoreAllMocks());

  it('adds a mapping from two pasted emote links', async () => {
    const calls = adminServer(() => []);
    renderAt('/review');
    await userEvent.type(await screen.findByLabelText('Normal emote link'), `https://7tv.app/emotes/${A}`);
    await userEvent.type(screen.getByLabelText('Seasonal emote link'), `https://cdn.7tv.app/emote/${B}/4x.webp`);
    await userEvent.click(screen.getByRole('button', { name: 'Add mapping' }));
    expect(await screen.findByText('Added the mapping.')).toBeInTheDocument();
    expect(calls).toContainEqual({
      method: 'PUT',
      url: '/api/admin/mappings',
      body: { season: 'halloween', originalId: A, replacementId: B, source: 'manual' },
    });
    expect(screen.getByLabelText('Normal emote link')).toHaveValue('');
  });

  it('says when an added mapping replaced one', async () => {
    adminServer(() => [], { mapping: { previous: row(A, 'RX') } });
    renderAt('/review');
    await userEvent.type(await screen.findByLabelText('Normal emote link'), A);
    await userEvent.type(screen.getByLabelText('Seasonal emote link'), B);
    await userEvent.click(screen.getByRole('button', { name: 'Add mapping' }));
    expect(await screen.findByText('Replaced the mapping.')).toBeInTheDocument();
  });

  it('refuses a link that isn’t an emote, and the same emote twice', async () => {
    const calls = adminServer(() => []);
    renderAt('/review');
    await userEvent.type(await screen.findByLabelText('Normal emote link'), 'peepoHappy');
    await userEvent.type(screen.getByLabelText('Seasonal emote link'), B);
    await userEvent.click(screen.getByRole('button', { name: 'Add mapping' }));
    expect(await screen.findByText('That isn’t a 7TV emote link.')).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText('Normal emote link'));
    await userEvent.type(screen.getByLabelText('Normal emote link'), B);
    await userEvent.click(screen.getByRole('button', { name: 'Add mapping' }));
    expect(await screen.findByText('Pick two different emotes.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'PUT')).toEqual([]);
  });

  it('deletes a mapping, and Undo puts it back as it was', async () => {
    const calls = adminServer(() => [], { mappings: () => [row('O1', 'R1')], deleted: row('O1', 'R1') });
    renderAt('/review');
    expect(await screen.findByText('Halloween preset · 1 mapping')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete O1' }));
    expect(await screen.findByText('Deleted the mapping.')).toBeInTheDocument();
    expect(calls).toContainEqual({ method: 'DELETE', url: '/api/admin/mappings/halloween/O1', body: undefined });
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(calls.at(-1)).toEqual({
      method: 'PUT',
      url: '/api/admin/mappings',
      body: { season: 'halloween', originalId: 'O1', replacementId: 'R1', source: 'seed' },
    });
  });

  it('downloads the preset in the data/presets format', async () => {
    adminServer(() => [], { mappings: () => [row('B1', 'B2', 'review'), row('A1', 'A2')] });
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (blob: Blob) => (blobs.push(blob), 'blob:x'), revokeObjectURL: () => {} }));
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    renderAt('/review');
    await userEvent.click(await screen.findByRole('button', { name: 'Download JSON' }));
    expect(blobs).toHaveLength(1);
    const text = await blobs[0]!.text();
    expect(JSON.parse(text)).toEqual({
      season: 'halloween',
      mappings: [
        { originalId: 'A1', replacementId: 'A2' },
        { originalId: 'B1', replacementId: 'B2' },
      ],
    });
    expect(text.endsWith('\n')).toBe(true);
  });
});
