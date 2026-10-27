import { SEVENTV_API } from '@shared/seventv';

/**
 * Changes to 7TV sets, made with the user's own token. The token goes to 7TV
 * and nowhere else; this site's server never sees it.
 */
const GQL = `${SEVENTV_API}/v3/gql`;

export type WriteErrorKind = 'auth' | 'rate-limit' | 'refused' | 'network';

export class WriteError extends Error {
  constructor(
    message: string,
    readonly kind: WriteErrorKind,
  ) {
    super(message);
    this.name = 'WriteError';
  }
}

export interface SetWriter {
  addEmote(setId: string, emoteId: string, alias: string): Promise<void>;
  removeEmote(setId: string, emoteId: string): Promise<void>;
  /** Resolves to the new set's ID. */
  createSet(ownerId: string, name: string): Promise<string>;
  deleteSet(setId: string): Promise<void>;
}

const CHANGE_EMOTE = `mutation ChangeEmoteInSet($id: ObjectID!, $action: ListItemAction!, $emote_id: ObjectID!, $name: String) {
  emoteSet(id: $id) { emotes(id: $emote_id, action: $action, name: $name) { id } }
}`;

const CREATE_SET = `mutation CreateEmoteSet($user_id: ObjectID!, $data: CreateEmoteSetInput!) {
  createEmoteSet(user_id: $user_id, data: $data) { id }
}`;

const DELETE_SET = `mutation DeleteEmoteSet($id: ObjectID!) { deleteEmoteSet(id: $id) }`;

/** What to do about a token 7TV rejects: logging out of 7tv.app and back in issues a fresh one. */
export const TOKEN_REJECTED =
  '7TV didn’t accept your token. Log out of 7tv.app and log back in, then copy the fresh token (the token guide shows where).';

// A rejected token comes back as a plain error body, not GraphQL errors: {"error":"invalid session","error_code":1000}.
interface GqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
  error?: string;
  error_code?: number;
}

function classify(status: number, message: string, code?: number): WriteErrorKind {
  if (status === 429 || /rate.?limit|too many/i.test(message)) return 'rate-limit';
  if (
    status === 401 ||
    code === 1000 ||
    /unauthori[sz]ed|not authenticated|invalid (token|session)|login required/i.test(message)
  ) {
    return 'auth';
  }
  return 'refused';
}

interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Retries rate limits and dropped connections with exponential backoff; anything else fails at once. */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 4, baseDelayMs = 1000, sleep: wait = sleep } = options;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const retryable = error instanceof WriteError && (error.kind === 'rate-limit' || error.kind === 'network');
      if (!retryable || attempt >= retries) throw error;
      await wait(baseDelayMs * 2 ** attempt);
    }
  }
}

export function createWriter(token: string, options: RetryOptions & { fetchFn?: typeof fetch } = {}): SetWriter {
  const fetchFn = options.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  const request = async <T,>(query: string, variables: Record<string, unknown>): Promise<T> => {
    let response: Response;
    try {
      response = await fetchFn(GQL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
      });
    } catch {
      throw new WriteError('Couldn’t reach 7TV.', 'network');
    }
    const body = (await response.json().catch(() => null)) as GqlResponse<T> | null;
    const message = body?.errors?.[0]?.message ?? body?.error ?? (response.ok ? '' : `7TV answered ${response.status}`);
    if (message || !response.ok) {
      const kind = classify(response.status, message, body?.error_code);
      throw new WriteError(kind === 'auth' ? TOKEN_REJECTED : message || '7TV refused the change.', kind);
    }
    return body?.data as T;
  };

  const send = <T,>(query: string, variables: Record<string, unknown>) =>
    withRetry(() => request<T>(query, variables), options);

  return {
    async addEmote(setId, emoteId, alias) {
      await send(CHANGE_EMOTE, { id: setId, action: 'ADD', emote_id: emoteId, name: alias });
    },
    async removeEmote(setId, emoteId) {
      await send(CHANGE_EMOTE, { id: setId, action: 'REMOVE', emote_id: emoteId });
    },
    async createSet(ownerId, name) {
      const data = await send<{ createEmoteSet?: { id: string } }>(CREATE_SET, { user_id: ownerId, data: { name } });
      const id = data?.createEmoteSet?.id;
      if (!id) throw new WriteError('7TV didn’t create the set.', 'refused');
      return id;
    },
    async deleteSet(setId) {
      await send(DELETE_SET, { id: setId });
    },
  };
}
