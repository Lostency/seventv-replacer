import type { SeasonId } from '@shared/seasons';
import type { PresetResponse, StatsResponse } from '@shared/types';

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return (await response.json()) as T;
}

export const fetchStats = (signal?: AbortSignal) => getJson<StatsResponse>('/api/stats', signal);

export const fetchPreset = (season: SeasonId, signal?: AbortSignal) =>
  getJson<PresetResponse>(`/api/presets/${season}`, signal);
