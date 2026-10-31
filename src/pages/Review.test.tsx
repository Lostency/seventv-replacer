import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminComparison, AdminComparisonsResponse, AdminMapping, BrokenEmote, Candidate, SubmitterGroup } from '@shared/types';
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
    comparisons?: AdminComparisonsResponse;
    discardFails?: boolean;
    /** Holds every season move's answer until it resolves. */
    moveGate?: Promise<void>;
  } = {},
) {
  const calls = Object.assign([] as Call[], { reads: [] as string[] });
  const record = (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') calls.reads.push(url);
    else calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return method;
  };
  const listed = answers.comparisons ?? { submitters: [], blocked: [] };
  const findComparison = (id: string) => listed.submitters.flatMap((s) => s.comparisons).find((c) => c.id === id)!;
  mockFetch({
    '/api/me': () => json(admin),
    '/api/admin/comparisons': async (url, init) => {
      const method = record(url, init);
      const id = decodeURIComponent(url.split('/')[4] ?? '');
      if (method === 'GET') return json(listed);
      if (method === 'PUT') {
        await answers.moveGate;
        const { season } = JSON.parse(String(init!.body)) as { season: string };
        return json({ comparison: { ...findComparison(id), season } });
      }
      if (answers.discardFails) return json({ error: 'The database went away.' }, 500);
      return json({ comparisons: 1, matches: findComparison(id).matches, blocked: null });
    },
    '/api/admin/submitters/': (url, init) => {
      record(url, init);
      const twitchId = decodeURIComponent(url.split('/')[4]!);
      const group = listed.submitters.find((s) => s.twitchId === twitchId)!;
      const { block } = JSON.parse(String(init!.body)) as { block: boolean };
      return json({
        comparisons: group.comparisons.length,
        matches: group.matches,
        blocked: block
          ? { twitchId, login: group.login, displayName: group.displayName, blockedAt: '2026-10-31 12:00:00' }
          : null,
      });
    },
    '/api/admin/blocked/': (url, init) => {
      record(url, init);
      return new Response(null, { status: 204 });
    },
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
    // The comparisons section reads its own list once on load; nothing here reads it again.
    expect(calls.reads.filter((url) => !url.startsWith('/api/me') && url !== '/api/admin/comparisons')).toHaveLength(3);
    expect(calls.reads.filter((url) => url === '/api/admin/comparisons')).toHaveLength(1);
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

describe('Review: comparisons', () => {
  const comparison = (overrides: Partial<AdminComparison> = {}): AdminComparison => ({
    id: 'C1',
    channelName: 'forsen',
    normalSetId: 'N1',
    normalSetName: 'Main',
    seasonalSetId: 'S1',
    seasonalSetName: 'Xmas',
    season: 'halloween',
    matches: 88,
    submittedAt: '2026-10-31T10:00:00.000Z',
    ...overrides,
  });
  const group = (overrides: Partial<SubmitterGroup> = {}): SubmitterGroup => ({
    twitchId: 'T2',
    login: 'spammer',
    displayName: 'spammer',
    admin: false,
    matches: 88,
    latest: '2026-10-31T10:00:00.000Z',
    comparisons: [comparison()],
    ...overrides,
  });
  const section = () => screen.findByRole('region', { name: 'Comparisons' });

  it('lists comparisons by submitter, with channel, sets, season, matches and date', async () => {
    adminServer(() => [], { comparisons: { submitters: [group()], blocked: [] } });
    renderAt('/review');
    const card = await within(await section()).findByRole('region', { name: 'spammer' });
    expect(within(card).getByText('1 comparison · 88 matches')).toBeInTheDocument();
    expect(within(card).getByText('forsen')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Main' })).toHaveAttribute('href', 'https://7tv.app/emote-sets/N1');
    expect(within(card).getByRole('link', { name: 'Xmas' })).toHaveAttribute('href', 'https://7tv.app/emote-sets/S1');
    expect(within(card).getByText(/Oct 31, 2026/)).toBeInTheDocument();
    const knob = within(card).getByRole('radiogroup', { name: 'Season for forsen' });
    expect(within(knob).getByRole('radio', { name: 'Halloween' })).toHaveAttribute('aria-checked', 'true');
  });

  it('shows the Twitch ID and set IDs when names are missing', async () => {
    const old = group({
      twitchId: 'T9',
      login: null,
      displayName: null,
      comparisons: [comparison({ normalSetName: null, seasonalSetName: null })],
    });
    adminServer(() => [], { comparisons: { submitters: [old], blocked: [] } });
    renderAt('/review');
    const card = await within(await section()).findByRole('region', { name: 'Twitch ID T9' });
    expect(within(card).getByRole('link', { name: 'N1' })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'S1' })).toBeInTheDocument();
  });

  it('moving a comparison re-reads only the review queue', async () => {
    const calls = adminServer(() => [], { comparisons: { submitters: [group()], blocked: [] } });
    renderAt('/review');
    const card = await within(await section()).findByRole('region', { name: 'spammer' });
    await waitFor(() => expect(calls.reads.filter((u) => u.startsWith('/api/admin/review/'))).toHaveLength(1));
    const before = calls.reads.length;
    const knob = within(card).getByRole('radiogroup', { name: 'Season for forsen' });
    await userEvent.click(within(knob).getByRole('radio', { name: 'Winter' }));
    await waitFor(() =>
      expect(calls).toContainEqual({ method: 'PUT', url: '/api/admin/comparisons/C1/season', body: { season: 'winter' } }),
    );
    await waitFor(() => expect(within(knob).getByRole('radio', { name: 'Winter' })).toHaveAttribute('aria-checked', 'true'));
    await waitFor(() => expect(calls.reads.filter((u) => u.startsWith('/api/admin/review/'))).toHaveLength(2));
    expect(calls.reads.slice(before).filter((u) => !u.startsWith('/api/admin/review/'))).toEqual([]);
  });

  it('sends one move at a time, however often the knob turns while it saves', async () => {
    let answer!: () => void;
    const moveGate = new Promise<void>((resolve) => (answer = resolve));
    const calls = adminServer(() => [], { comparisons: { submitters: [group()], blocked: [] }, moveGate });
    renderAt('/review');
    const card = await within(await section()).findByRole('region', { name: 'spammer' });
    const knob = within(card).getByRole('radiogroup', { name: 'Season for forsen' });
    await userEvent.click(within(knob).getByRole('radio', { name: 'Winter' }));
    await userEvent.click(within(knob).getByRole('radio', { name: 'Winter' }));
    await userEvent.click(within(knob).getByRole('radio', { name: 'Winter' }));
    answer();
    await waitFor(() => expect(within(knob).getByRole('radio', { name: 'Winter' })).toHaveAttribute('aria-checked', 'true'));
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    await waitFor(() => expect(calls.reads.filter((u) => u.startsWith('/api/admin/review/'))).toHaveLength(2));
  });

  it('discarding one comparison asks first, then takes it off without reading the list again', async () => {
    const two = group({ matches: 100, comparisons: [comparison(), comparison({ id: 'C2', channelName: 'xqc', matches: 12 })] });
    const calls = adminServer(() => [], { comparisons: { submitters: [two], blocked: [] } });
    renderAt('/review');
    const card = await within(await section()).findByRole('region', { name: 'spammer' });
    await userEvent.click(within(card).getByRole('button', { name: 'Discard forsen' }));
    expect(within(card).getByText('Discard 1 comparison and 88 matches?')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Cancel' }));
    expect(calls.filter((c) => c.method === 'DELETE')).toEqual([]);

    await userEvent.click(within(card).getByRole('button', { name: 'Discard forsen' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(within(card).queryByText('forsen')).not.toBeInTheDocument());
    expect(calls).toContainEqual({ method: 'DELETE', url: '/api/admin/comparisons/C1', body: undefined });
    expect(within(card).getByText('1 comparison · 12 matches')).toBeInTheDocument();
    expect(calls.reads.filter((u) => u === '/api/admin/comparisons')).toHaveLength(1);

    await userEvent.click(within(card).getByRole('button', { name: 'Discard xqc' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'spammer' })).not.toBeInTheDocument());
  });

  it('discard all & block moves the submitter to the Blocked list', async () => {
    const big = group({
      matches: 3902,
      comparisons: Array.from({ length: 41 }, (_, i) => comparison({ id: `C${i}`, channelName: `ch${i}`, matches: i === 0 ? 3862 : 1 })),
    });
    const calls = adminServer(() => [], { comparisons: { submitters: [big], blocked: [] } });
    renderAt('/review');
    const list = await section();
    const card = await within(list).findByRole('region', { name: 'spammer' });
    await userEvent.click(within(card).getByRole('button', { name: 'Discard all & block' }));
    expect(within(card).getByText('Discard 41 comparisons and 3,902 matches, and block spammer?')).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Discard and block' }));
    await waitFor(() => expect(within(list).queryByRole('region', { name: 'spammer' })).not.toBeInTheDocument());
    expect(calls).toContainEqual({ method: 'POST', url: '/api/admin/submitters/T2/discard', body: { block: true } });

    const blocked = within(list).getByRole('list', { name: 'Blocked' });
    expect(within(blocked).getByText('spammer')).toBeInTheDocument();
    await userEvent.click(within(blocked).getByRole('button', { name: 'Unblock spammer' }));
    await waitFor(() => expect(within(list).queryByRole('list', { name: 'Blocked' })).not.toBeInTheDocument());
    expect(calls).toContainEqual({ method: 'DELETE', url: '/api/admin/blocked/T2', body: undefined });
  });

  it('hides the block key on an admin’s card', async () => {
    const own = group({ twitchId: 'T1', login: 'niena', displayName: 'niena', admin: true });
    adminServer(() => [], { comparisons: { submitters: [own], blocked: [] } });
    renderAt('/review');
    const card = await within(await section()).findByRole('region', { name: 'niena' });
    expect(within(card).getByRole('button', { name: 'Discard all' })).toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Discard all & block' })).not.toBeInTheDocument();
  });

  it('says when a discard fails, and reads the list again', async () => {
    const calls = adminServer(() => [], { comparisons: { submitters: [group()], blocked: [] }, discardFails: true });
    renderAt('/review');
    const card = await within(await section()).findByRole('region', { name: 'spammer' });
    await userEvent.click(within(card).getByRole('button', { name: 'Discard forsen' }));
    await userEvent.click(within(card).getByRole('button', { name: 'Discard' }));
    expect(await screen.findByText('The database went away.')).toBeInTheDocument();
    await waitFor(() => expect(calls.reads.filter((u) => u === '/api/admin/comparisons')).toHaveLength(2));
  });

  it('starts cards after the first three collapsed', async () => {
    const many = ['A', 'B', 'C', 'D'].map((n) =>
      group({ twitchId: `T-${n}`, login: n, displayName: n, comparisons: [comparison({ id: `C-${n}`, channelName: `ch-${n}` })] }),
    );
    adminServer(() => [], { comparisons: { submitters: many, blocked: [] } });
    renderAt('/review');
    const list = await section();
    expect(within(await within(list).findByRole('region', { name: 'C' })).getByText('ch-C')).toBeInTheDocument();
    const last = within(list).getByRole('region', { name: 'D' });
    expect(within(last).queryByText('ch-D')).not.toBeInTheDocument();
    await userEvent.click(within(last).getByRole('button', { name: 'Show 1 comparison' }));
    expect(within(last).getByText('ch-D')).toBeInTheDocument();
  });
});
