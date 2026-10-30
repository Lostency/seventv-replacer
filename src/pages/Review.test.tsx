import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminMapping, BrokenEmote, Candidate } from '@shared/types';
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

const brokenReport: BrokenEmote = {
  originalId: 'O1',
  replacementId: 'R1',
  brokenId: 'R1',
  reason: 'Emote is private',
  reports: 3,
  firstSeen: '2026-10-27 12:00:00',
  lastSeen: '2026-10-28 09:00:00',
};

type Call = { method: string; url: string; body?: unknown };

/** An admin's server: the queue answers `queue()` each time, writes are recorded, and reads counted in `calls.reads`. */
function adminServer(
  queue: () => Candidate[],
  answers: {
    mapping?: unknown;
    decision?: unknown;
    mappings?: () => AdminMapping[];
    deleted?: AdminMapping;
    broken?: () => BrokenEmote[];
  } = {},
) {
  const calls = Object.assign([] as Call[], { reads: [] as string[] });
  const record = (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') calls.reads.push(url);
    else calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
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
    '/api/admin/broken/': (url, init) => {
      const method = record(url, init);
      const list = answers.broken?.() ?? [];
      return method === 'DELETE' ? json({ dismissed: list[0] ?? null }) : json({ season: 'halloween', broken: list });
    },
    '/api/admin/broken': (url, init) => {
      record(url, init);
      return json({});
    },
    '/api/admin/decisions': (url, init) => {
      record(url, init);
      return json(answers.decision ?? { previous: null });
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

  it('puts the current mapping and every option for one emote in one card', async () => {
    adminServer(() => [
      candidate({ current: 'RX' }),
      candidate({ replacementId: 'R2', channels: 2, current: 'RX' }),
      candidate({ originalId: 'O2', replacementId: 'R3', alias: 'Sadge' }),
    ]);
    renderAt('/review');
    const card = (await screen.findByText('peepoHappy · 2 options')).closest('li')!;
    expect(within(card).getByText('Current')).toBeInTheDocument();
    expect(within(card).getByText('Seen in 3 channels')).toBeInTheDocument();
    expect(within(card).getByText('Seen in 2 channels')).toBeInTheDocument();
    expect(within(card).getAllByRole('button', { name: /^Keep/ })).toHaveLength(3);
    expect(within(card).queryByRole('button', { name: 'Reject all' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(1);
  });

  it('keeps one option, rejects the rest and the old mapping, and Undo restores all of it', async () => {
    const previous = { originalId: 'O1', replacementId: 'RX', source: 'seed', createdAt: '2026-10-27 12:00:00' };
    const calls = adminServer(
      () => [candidate({ current: 'RX' }), candidate({ replacementId: 'R2', channels: 2, current: 'RX' })],
      { decision: { previous } },
    );
    renderAt('/review');
    await userEvent.click(await screen.findByRole('button', { name: 'Keep option 2' }));
    expect(await screen.findByText('Kept a new peepoHappy.')).toBeInTheDocument();
    expect(calls).toContainEqual({
      method: 'POST',
      url: '/api/admin/decisions',
      body: { season: 'halloween', originalId: 'O1', replacementId: 'R2', rejectIds: ['R1', 'RX'] },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: 'PUT',
        url: '/api/admin/mappings',
        body: { season: 'halloween', originalId: 'O1', replacementId: 'RX', source: 'seed' },
      }),
    );
    expect(calls).toContainEqual({ method: 'DELETE', url: '/api/admin/rejections/halloween/O1/R1', body: undefined });
    expect(calls).toContainEqual({ method: 'DELETE', url: '/api/admin/rejections/halloween/O1/RX', body: undefined });
  });

  it('keeping the current mapping rejects every option', async () => {
    const calls = adminServer(() => [candidate({ current: 'RX' })]);
    renderAt('/review');
    await userEvent.click(await screen.findByRole('button', { name: 'Keep current' }));
    expect(await screen.findByText('Kept the current peepoHappy.')).toBeInTheDocument();
    expect(calls).toContainEqual({
      method: 'POST',
      url: '/api/admin/decisions',
      body: { season: 'halloween', originalId: 'O1', replacementId: null, rejectIds: ['R1'] },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(calls).toContainEqual({ method: 'DELETE', url: '/api/admin/rejections/halloween/O1/R1', body: undefined }),
    );
    expect(calls.filter((c) => c.url.startsWith('/api/admin/mappings'))).toEqual([]);
  });

  it('rejects every option at once when nothing is mapped yet', async () => {
    const calls = adminServer(() => [candidate(), candidate({ replacementId: 'R2', channels: 2 })]);
    renderAt('/review');
    await userEvent.click(await screen.findByRole('button', { name: 'Reject all' }));
    expect(await screen.findByText('Rejected every peepoHappy option.')).toBeInTheDocument();
    expect(calls).toContainEqual({
      method: 'POST',
      url: '/api/admin/decisions',
      body: { season: 'halloween', originalId: 'O1', replacementId: null, rejectIds: ['R1', 'R2'] },
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

  it('accepting takes the card off the queue and adds the mapping to the preset without reading either again', async () => {
    const calls = adminServer(() => [candidate()]);
    renderAt('/review');
    expect(await screen.findByText('Halloween preset · 0 mappings')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('Accepted peepoHappy.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
    expect(screen.getByText('Halloween preset · 1 mapping')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete O1' })).toBeInTheDocument();
    expect(calls.reads.filter((url) => url.startsWith('/api/admin/review/'))).toHaveLength(1);
    expect(calls.reads.filter((url) => url.startsWith('/api/admin/mappings/'))).toHaveLength(1);
  });

  it('rejecting takes the card off the queue without reading it again', async () => {
    const calls = adminServer(() => [candidate(), candidate({ originalId: 'O2', replacementId: 'R2', alias: 'Sadge' })]);
    renderAt('/review');
    await userEvent.click((await screen.findAllByRole('button', { name: 'Reject' }))[0]!);
    expect(await screen.findByText('Rejected peepoHappy.')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Reject' })).toHaveLength(1);
    expect(screen.getByText('Sadge → Sadge · seen in 3 channels')).toBeInTheDocument();
    expect(calls.reads.filter((url) => url.startsWith('/api/admin/review/'))).toHaveLength(1);
  });

  it('keeping a new option clears the card, swaps the preset row and drops the old mapping’s broken report, reading nothing again', async () => {
    const previous = row('O1', 'RX');
    const calls = adminServer(
      () => [candidate({ current: 'RX' }), candidate({ replacementId: 'R2', channels: 2, current: 'RX' })],
      {
        decision: { previous },
        mappings: () => [previous],
        broken: () => [{ ...brokenReport, replacementId: 'RX', brokenId: 'RX' }],
      },
    );
    renderAt('/review');
    const broken = await screen.findByRole('region', { name: 'Broken emotes' });
    expect(await within(broken).findByText(/Emote is private/)).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Keep option 2' }));
    expect(await screen.findByText('Kept a new peepoHappy.')).toBeInTheDocument();
    expect(screen.queryByText('peepoHappy · 2 options')).not.toBeInTheDocument();
    expect(screen.getByText('Halloween preset · 1 mapping')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Halloween mappings' })).getByRole('link', { name: 'Seasonal on 7TV' })).toHaveAttribute(
      'href',
      expect.stringContaining('/R2'),
    );
    expect(within(broken).queryByText(/Emote is private/)).not.toBeInTheDocument();
    expect(calls.reads.filter((url) => !url.startsWith('/api/me'))).toHaveLength(3);
  });

  it('Undo reads the queue again, since the server decides what comes back', async () => {
    const calls = adminServer(() => [candidate()]);
    renderAt('/review');
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(calls.reads.filter((url) => url.startsWith('/api/admin/review/'))).toHaveLength(2);
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

describe('Review: broken emotes', () => {
  const report = brokenReport;

  it('lists them apart from the queue, with what 7TV said and how often', async () => {
    adminServer(() => [], { broken: () => [report] });
    renderAt('/review');
    const section = await screen.findByRole('region', { name: 'Broken emotes' });
    expect(await within(section).findByText(/Emote is private/)).toBeInTheDocument();
    expect(within(section).getByText(/The seasonal emote broke/)).toBeInTheDocument();
    expect(within(section).getByText(/Reported 3 times/)).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'O1, normal on 7TV' })).toBeInTheDocument();
  });

  it('dismisses a report, and Undo puts it back', async () => {
    const calls = adminServer(() => [], { broken: () => [report] });
    renderAt('/review');
    const section = await screen.findByRole('region', { name: 'Broken emotes' });
    await userEvent.click(await within(section).findByRole('button', { name: 'Dismiss O1' }));
    expect(await screen.findByText('Dismissed the report.')).toBeInTheDocument();
    expect(calls).toContainEqual({ method: 'DELETE', url: '/api/admin/broken/halloween/O1/R1', body: undefined });
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(calls).toContainEqual({ method: 'PUT', url: '/api/admin/broken', body: { season: 'halloween', ...report } }),
    );
  });

  it('dismissing takes the report off without reading the reports again', async () => {
    const calls = adminServer(() => [], { broken: () => [report] });
    renderAt('/review');
    const section = await screen.findByRole('region', { name: 'Broken emotes' });
    await userEvent.click(await within(section).findByRole('button', { name: 'Dismiss O1' }));
    expect(await screen.findByText('Dismissed the report.')).toBeInTheDocument();
    expect(within(section).queryByText(/Emote is private/)).not.toBeInTheDocument();
    expect(calls.reads.filter((url) => url.startsWith('/api/admin/broken/'))).toHaveLength(1);
  });

  it('replaces the broken seasonal emote from a pasted link', async () => {
    const calls = adminServer(() => [], { broken: () => [report], mapping: { previous: row('O1', 'R1') } });
    renderAt('/review');
    const section = await screen.findByRole('region', { name: 'Broken emotes' });
    await userEvent.click(await within(section).findByRole('button', { name: 'Replace O1' }));
    await userEvent.type(within(section).getByLabelText('New seasonal emote link'), `https://7tv.app/emotes/${B}`);
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Replaced the mapping.')).toBeInTheDocument();
    expect(calls).toContainEqual({
      method: 'PUT',
      url: '/api/admin/mappings',
      body: { season: 'halloween', originalId: 'O1', replacementId: B, source: 'manual' },
    });
  });

  it('deletes the mapping of a broken normal emote', async () => {
    const calls = adminServer(() => [], { broken: () => [{ ...report, brokenId: 'O1' }], deleted: row('O1', 'R1') });
    renderAt('/review');
    const section = await screen.findByRole('region', { name: 'Broken emotes' });
    expect(await within(section).findByText(/The normal emote broke/)).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Replace O1' })).not.toBeInTheDocument();
    await userEvent.click(within(section).getByRole('button', { name: 'Delete mapping O1' }));
    expect(await screen.findByText('Deleted the mapping.')).toBeInTheDocument();
    expect(calls).toContainEqual({ method: 'DELETE', url: '/api/admin/mappings/halloween/O1', body: undefined });
  });
});
