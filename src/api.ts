import type { SeasonId } from '@shared/seasons';
import type {
  ApiError,
  ComparisonPreview,
  ComparisonPreviewRequest,
  ComparisonSubmitRequest,
  ComparisonSubmitted,
  Cooldown,
  MeResponse,
  PresetResponse,
  StatsResponse,
} from '@shared/types';

/** An answer from our own API that isn't a success, carrying its plain-language message. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly cooldown?: Cooldown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiRequestError('Couldn’t reach the server. Check your connection and try again.', 0);
  }
  if (response.status === 204) return undefined as T;
  const json = (await response.json().catch(() => null)) as (T & Partial<ApiError>) | null;
  if (!response.ok) {
    throw new ApiRequestError(json?.error ?? `The server answered ${response.status}. Try again.`, response.status, json?.cooldown);
  }
  return json as T;
}

export const fetchStats = (signal?: AbortSignal) => getJson<StatsResponse>('/api/stats', signal);

export const fetchPreset = (season: SeasonId, signal?: AbortSignal) =>
  getJson<PresetResponse>(`/api/presets/${season}`, signal);

export const fetchMe = (signal?: AbortSignal) => getJson<MeResponse>('/api/me', signal);

export const signOut = () => postJson<void>('/api/auth/logout');

export const signInUrl = (returnTo: string) => `/api/auth/login?${new URLSearchParams({ return: returnTo })}`;

export const previewComparison = (body: ComparisonPreviewRequest) =>
  postJson<ComparisonPreview>('/api/comparisons/preview', body);

export const submitComparison = (body: ComparisonSubmitRequest) =>
  postJson<ComparisonSubmitted>('/api/comparisons', body);
