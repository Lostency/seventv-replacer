import type { RunRecord } from './run';

/**
 * What Replace keeps in this browser: the 7TV token and the last runs for Undo.
 * Storage can be missing or blocked (private windows), so every access is guarded.
 */
const TOKEN_KEY = 'ser.7tv-token';
const RUNS_KEY = 'ser.runs';
export const MAX_RUNS = 10;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage is blocked: the value lasts as long as the page.
  }
}

/** Accepts the value as copied from DevTools: quoted, with "Bearer ", or with stray whitespace. */
export function cleanToken(pasted: string): string {
  return pasted
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^Bearer\s+/i, '')
    .trim();
}

export const loadToken = () => read(TOKEN_KEY) ?? '';
export const saveToken = (token: string) => write(TOKEN_KEY, token || null);

export function loadRuns(): RunRecord[] {
  try {
    const runs: unknown = JSON.parse(read(RUNS_KEY) ?? '[]');
    return Array.isArray(runs) ? (runs as RunRecord[]) : [];
  } catch {
    return [];
  }
}

/** Newest first, at most the last ten. */
export function rememberRun(record: RunRecord): RunRecord[] {
  const runs = [record, ...loadRuns().filter((r) => r.id !== record.id)].slice(0, MAX_RUNS);
  write(RUNS_KEY, JSON.stringify(runs));
  return runs;
}

export function forgetRun(id: string): RunRecord[] {
  const runs = loadRuns().filter((r) => r.id !== id);
  write(RUNS_KEY, JSON.stringify(runs));
  return runs;
}
