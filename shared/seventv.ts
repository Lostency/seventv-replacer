/**
 * Read-only 7TV access, shared by the browser (Replace, the set picker) and
 * the Worker (Compare fetches both sets itself). Nothing here needs a token.
 */
export const SEVENTV_API = 'https://7tv.io';
const IVR_API = 'https://api.ivr.fi';

/** One emote as it sits in a set: its ID, and the alias it is typed as there. */
export interface SetEmote {
  id: string;
  alias: string;
}

export interface SetOwner {
  id: string;
  name: string;
}

export interface EmoteSet {
  id: string;
  name: string;
  owner: SetOwner | null;
  capacity: number | null;
  emotes: SetEmote[];
}

export interface SetSummary {
  id: string;
  name: string;
  /** The set the channel has switched on in chat right now. */
  active: boolean;
}

export interface ChannelSets {
  channel: string;
  sets: SetSummary[];
}

export type SevenTvErrorKind = 'not-found' | 'no-account' | 'unavailable';

export class SevenTvError extends Error {
  constructor(
    message: string,
    readonly kind: SevenTvErrorKind,
  ) {
    super(message);
    this.name = 'SevenTvError';
  }
}

type Fetch = typeof fetch;

// 7TV IDs are ULIDs now; sets made before 2023 can still carry 24-hex ObjectIDs.
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const OBJECT_ID = /^[0-9a-f]{24}$/i;
const SET_URL = /7tv\.app\/emote-sets\/([0-9A-Za-z]+)/i;
// An emote page (7tv.app/emotes/<id>, any subdomain) or a CDN image (cdn.7tv.app/emote/<id>/4x.webp).
const EMOTE_URL = /7tv\.app\/emotes?\/([0-9A-Za-z]+)/i;
const TWITCH_LOGIN = /^[A-Za-z0-9_]{1,25}$/;

export function isEmoteId(value: string): boolean {
  return ULID.test(value) || OBJECT_ID.test(value);
}

/** A pasted 7TV set link, or a bare set ID. Anything else is not a set reference. */
export function parseSetRef(input: string): string | null {
  const text = input.trim();
  const fromUrl = SET_URL.exec(text)?.[1];
  const id = fromUrl ?? text;
  return isEmoteId(id) ? id : null;
}

/** A pasted 7TV emote link or image link, or a bare emote ID. Anything else is not an emote reference. */
export function parseEmoteRef(input: string): string | null {
  const text = input.trim();
  const id = EMOTE_URL.exec(text)?.[1] ?? text;
  return isEmoteId(id) ? id : null;
}

/** A Twitch login from "niena", "@niena" or a twitch.tv link; null when it can't be one. */
export function parseChannel(input: string): string | null {
  const text = input
    .trim()
    .replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '');
  return TWITCH_LOGIN.test(text) ? text.toLowerCase() : null;
}

async function readJson(fetchFn: Fetch, url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    response = await fetchFn(url, init);
  } catch {
    throw new SevenTvError('Couldn’t reach 7TV. Check your connection and try again.', 'unavailable');
  }
  const body: unknown = await response.json().catch(() => null);
  return { status: response.status, body };
}

interface V3SetBody {
  id: string;
  name: string;
  capacity?: number;
  owner?: { id: string; username?: string; display_name?: string } | null;
  emotes?: Array<{ id: string; name: string }> | null;
}

export async function fetchEmoteSet(id: string, fetchFn: Fetch = fetch): Promise<EmoteSet> {
  const { status, body } = await readJson(fetchFn, `${SEVENTV_API}/v3/emote-sets/${encodeURIComponent(id)}`);
  if (status === 404 || status === 400) {
    throw new SevenTvError('7TV has no emote set with that ID. Check the link and try again.', 'not-found');
  }
  if (status !== 200 || !body || typeof body !== 'object') {
    throw new SevenTvError(`7TV didn’t answer as expected (status ${status}). Try again in a minute.`, 'unavailable');
  }
  const set = body as V3SetBody;
  return {
    id: set.id,
    name: set.name,
    capacity: typeof set.capacity === 'number' ? set.capacity : null,
    owner: set.owner ? { id: set.owner.id, name: set.owner.display_name || set.owner.username || set.owner.id } : null,
    emotes: (set.emotes ?? []).map((e) => ({ id: e.id, alias: e.name })),
  };
}

interface GqlBody<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

/** Every set a channel's 7TV account owns, its active set first. */
export async function fetchChannelSets(login: string, fetchFn: Fetch = fetch): Promise<ChannelSets> {
  const twitch = await readJson(fetchFn, `${IVR_API}/v2/twitch/user?login=${encodeURIComponent(login)}`);
  const twitchUser = Array.isArray(twitch.body) ? (twitch.body[0] as { id?: string; displayName?: string }) : undefined;
  if (!twitchUser?.id) throw new SevenTvError(`There’s no Twitch channel called “${login}”.`, 'not-found');
  const channel = twitchUser.displayName || login;

  const query = `{users{userByConnection(platform:TWITCH,platformId:${JSON.stringify(twitchUser.id)}){id ownedEmoteSets{id name kind}}}}`;
  const gql = await readJson(fetchFn, `${SEVENTV_API}/v4/gql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  type UserData = {
    users?: { userByConnection?: { id: string; ownedEmoteSets?: Array<{ id: string; name: string; kind?: string }> } | null };
  };
  const result = gql.body as GqlBody<UserData> | null;
  if (gql.status !== 200 || !result || result.errors?.length) {
    throw new SevenTvError('7TV couldn’t list that channel’s sets right now. Try again, or paste a set link.', 'unavailable');
  }
  const user = result.data?.users?.userByConnection;
  if (!user) throw new SevenTvError(`${channel} doesn’t have a 7TV account yet.`, 'no-account');

  const sets: SetSummary[] = (user.ownedEmoteSets ?? [])
    .filter((s) => s.kind?.toUpperCase() !== 'PERSONAL')
    .map((s) => ({ id: s.id, name: s.name, active: false }));

  // The active set is optional detail: if 7TV won't say, the list still works.
  const v3 = await readJson(fetchFn, `${SEVENTV_API}/v3/users/${encodeURIComponent(user.id)}`).catch(() => null);
  type V3User = { connections?: Array<{ platform?: string; emote_set_id?: string; emote_set?: { id: string; name: string } }> };
  const twitchConnection = (v3?.body as V3User | null)?.connections?.find((c) => c.platform === 'TWITCH');
  const activeId = twitchConnection?.emote_set_id ?? twitchConnection?.emote_set?.id;
  if (activeId) {
    const owned = sets.find((s) => s.id === activeId);
    if (owned) owned.active = true;
    // An editor-built set the channel uses but doesn't own.
    else sets.push({ id: activeId, name: twitchConnection?.emote_set?.name ?? 'Active set', active: true });
  }
  sets.sort((a, b) => Number(b.active) - Number(a.active));
  return { channel, sets };
}

export function seventvSetUrl(id: string): string {
  return `https://7tv.app/emote-sets/${id}`;
}
