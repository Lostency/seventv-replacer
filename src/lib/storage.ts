import type { RunProblem, RunRecord } from './run';

/**
 * What Replace keeps in this browser: the 7TV token, the last runs for Undo, and the emotes runs set aside.
 * Storage can be missing or blocked (private windows), so every access is guarded.
 */
const TOKEN_KEY = 'ser.7tv-token';
const RUNS_KEY = 'ser.runs';
const PROBLEMS_KEY = 'ser.problems';
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

/** Keeps the run's place in the list: a fix to an older run doesn't make it the newest. */
export function updateRun(id: string, change: (record: RunRecord) => RunRecord): RunRecord[] {
  const runs = loadRuns().map((r) => (r.id === id ? change(r) : r));
  write(RUNS_KEY, JSON.stringify(runs));
  return runs;
}

// Without storage, problems last as long as the page, like everything else here.
let problemsInMemory: RunProblem[] = [];

function storageWorks(): boolean {
  try {
    localStorage.setItem('ser.probe', '1');
    localStorage.removeItem('ser.probe');
    return true;
  } catch {
    return false;
  }
}

export function loadProblems(): RunProblem[] {
  const stored = read(PROBLEMS_KEY);
  if (stored === null) return storageWorks() ? [] : problemsInMemory;
  try {
    const problems: unknown = JSON.parse(stored);
    return Array.isArray(problems) ? (problems as RunProblem[]) : [];
  } catch {
    return [];
  }
}

/** Reads the saved problems fresh, so a run adding one and the user fixing another never overwrite each other. */
export function updateProblems(change: (problems: RunProblem[]) => RunProblem[]): RunProblem[] {
  const problems = change(loadProblems());
  problemsInMemory = problems;
  write(PROBLEMS_KEY, JSON.stringify(problems));
  return problems;
}

export const forgetProblem = (id: string) => updateProblems((list) => list.filter((p) => p.id !== id));
export const forgetRunProblems = (runId: string) => updateProblems((list) => list.filter((p) => p.runId !== runId));
