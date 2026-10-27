import { SEVENTV_API } from '@shared/seventv';

/**
 * Changes to 7TV sets, made with the user's own token. The token goes to 7TV
 * and nowhere else; this site's server never sees it.
 */
const GQL_V3 = `${SEVENTV_API}/v3/gql`;
const GQL_V4 = `${SEVENTV_API}/v4/gql`;

/** Emote changes per v4 request: v4 takes an array of mutations and answers each one separately. */
export const BATCH_SIZE = 30;

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

export interface EmoteRef {
  emoteId: string;
  alias: string;
}

/** One emote's outcome inside a batch: 7TV accepts or refuses each change on its own. */
export type ItemResult = { ok: true } | { ok: false; error: WriteError };

export interface SetWriter {
  /**
   * Adds or removes many emotes in as few requests as 7TV allows. Resolves to
   * one result per emote, in order; rejects only when the whole request failed
   * (e.g. the token was refused), in which case nothing is known to have changed.
   */
  addEmotes(setId: string, emotes: EmoteRef[]): Promise<ItemResult[]>;
  removeEmotes(setId: string, emotes: EmoteRef[]): Promise<ItemResult[]>;
  addEmote(setId: string, emoteId: string, alias: string): Promise<void>;
  removeEmote(setId: string, emoteId: string, alias: string): Promise<void>;
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

/** v4 answering like this means it can't run our mutation at all, not that 7TV refused the emote. */
const SCHEMA_PROBLEM = /unknown (field|argument|type)|cannot query field|is not defined|syntax error|parse error/i;

const v4Mutation = (field: 'addEmote' | 'removeEmote', setId: string, emote: EmoteRef) =>
  // JSON string escaping is valid GraphQL string escaping, so any alias (quotes included) stays intact.
  `mutation { emoteSets { emoteSet(id: ${JSON.stringify(setId)}) { ${field}(id: { emoteId: ${JSON.stringify(
    emote.emoteId,
  )}, alias: ${JSON.stringify(emote.alias)} }) { id } } } }`;

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

const toError = (status: number, message: string, code?: number) => {
  const kind = classify(status, message, code);
  return new WriteError(kind === 'auth' ? TOKEN_REJECTED : message || '7TV refused the change.', kind);
};

/** v4 couldn't take the batch at all; the caller falls back to v3, one emote per request. */
class BatchUnsupported extends Error {}

export function createWriter(
  token: string,
  options: RetryOptions & { fetchFn?: typeof fetch; pauseMs?: number } = {},
): SetWriter {
  const fetchFn = options.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const { pauseMs = 250, sleep: wait = sleep } = options;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  let batching = true;

  const post = async (url: string, body: unknown): Promise<{ status: number; json: unknown }> => {
    try {
      const response = await fetchFn(url, { method: 'POST', headers, body: JSON.stringify(body) });
      return { status: response.status, json: await response.json().catch(() => null) };
    } catch {
      throw new WriteError('Couldn’t reach 7TV.', 'network');
    }
  };

  const request = async <T,>(query: string, variables: Record<string, unknown>): Promise<T> => {
    const { status, json } = await post(GQL_V3, { query, variables });
    const body = json as GqlResponse<T> | null;
    const ok = status >= 200 && status < 300;
    const message = body?.errors?.[0]?.message ?? body?.error ?? (ok ? '' : `7TV answered ${status}`);
    if (message || !ok) throw toError(status, message, body?.error_code);
    return body?.data as T;
  };

  const send = <T,>(query: string, variables: Record<string, unknown>) =>
    withRetry(() => request<T>(query, variables), options);

  /** One v4 request for up to BATCH_SIZE changes. */
  const batch = async (field: 'addEmote' | 'removeEmote', setId: string, emotes: EmoteRef[]): Promise<ItemResult[]> => {
    const { status, json } = await post(
      GQL_V4,
      emotes.map((e) => ({ query: v4Mutation(field, setId, e) })),
    );
    if (!Array.isArray(json)) {
      const body = json as GqlResponse<unknown> | null;
      const message = body?.errors?.[0]?.message ?? body?.error ?? `7TV answered ${status}`;
      const error = toError(status, message, body?.error_code);
      // Token, rate limit or network: v3 would fare no better. Anything else: v4 won't batch for us.
      if (error.kind !== 'refused') throw error;
      throw new BatchUnsupported(message);
    }
    const answers = json as Array<GqlResponse<unknown> | null>;
    if (answers.length !== emotes.length) throw new BatchUnsupported('7TV answered a different number of changes');
    if (answers.some((a) => SCHEMA_PROBLEM.test(a?.errors?.[0]?.message ?? ''))) {
      throw new BatchUnsupported(answers.find((a) => a?.errors?.length)!.errors![0]!.message);
    }
    return answers.map((answer) => {
      const message = answer?.errors?.[0]?.message;
      return message ? { ok: false, error: toError(200, message) } : { ok: true };
    });
  };

  /** The tested v3 path: one emote per request, paced. */
  const oneByOne = async (action: 'ADD' | 'REMOVE', setId: string, emotes: EmoteRef[]): Promise<ItemResult[]> => {
    const results: ItemResult[] = [];
    for (const [i, emote] of emotes.entries()) {
      if (i > 0) await wait(pauseMs);
      try {
        await send(CHANGE_EMOTE, { id: setId, action, emote_id: emote.emoteId, name: emote.alias });
        results.push({ ok: true });
      } catch (error) {
        if (error instanceof WriteError && error.kind === 'auth') throw error;
        results.push({ ok: false, error: error instanceof WriteError ? error : toError(0, String(error)) });
      }
    }
    return results;
  };

  const many = async (field: 'addEmote' | 'removeEmote', setId: string, emotes: EmoteRef[]): Promise<ItemResult[]> => {
    const action = field === 'addEmote' ? 'ADD' : 'REMOVE';
    const results: ItemResult[] = [];
    for (let start = 0; start < emotes.length; start += BATCH_SIZE) {
      if (start > 0) await wait(pauseMs);
      const chunk = emotes.slice(start, start + BATCH_SIZE);
      if (batching) {
        try {
          const answers = await withRetry(() => batch(field, setId, chunk), options);
          // Emotes 7TV turned away for going too fast get one more paced try each.
          for (const [i, answer] of answers.entries()) {
            if (!answer.ok && answer.error.kind === 'rate-limit') {
              await wait(options.baseDelayMs ?? 1000);
              answers[i] = (await oneByOne(action, setId, [chunk[i]!]))[0]!;
            }
          }
          results.push(...answers);
          continue;
        } catch (error) {
          if (!(error instanceof BatchUnsupported)) throw error;
          batching = false;
        }
      }
      results.push(...(await oneByOne(action, setId, chunk)));
    }
    return results;
  };

  const single = async (field: 'addEmote' | 'removeEmote', setId: string, emote: EmoteRef) => {
    const [result] = await many(field, setId, [emote]);
    if (result && !result.ok) throw result.error;
  };

  return {
    addEmotes: (setId, emotes) => many('addEmote', setId, emotes),
    removeEmotes: (setId, emotes) => many('removeEmote', setId, emotes),
    addEmote: (setId, emoteId, alias) => single('addEmote', setId, { emoteId, alias }),
    removeEmote: (setId, emoteId, alias) => single('removeEmote', setId, { emoteId, alias }),
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
