import type { SeasonId } from '@shared/seasons';
import { checkEmote, type EmoteHealth, type EmoteSet } from '@shared/seventv';
import type { MappingRow } from '@shared/types';
import { BATCH_SIZE, sleep, TOKEN_REJECTED, WriteError, type ItemResult, type SetWriter } from './seventv-write';

export type RunMode = 'duplicate' | 'in-place' | 'revert';

/** One emote in the set that the run will exchange, keeping its alias. */
export interface PlannedSwap {
  alias: string;
  fromId: string;
  toId: string;
}

export interface SwapPlan {
  swaps: PlannedSwap[];
  /** Emotes the preset has no other version of. */
  unmapped: number;
  /** Swaps left out because their emote is already in the set: 7TV holds one copy of an emote per set. */
  alreadyThere: number;
}

/** Which emotes a run would exchange: the preset forwards, or backwards for a revert. */
export function planSwaps(set: EmoteSet, mappings: MappingRow[], mode: RunMode): SwapPlan {
  const lookup = new Map<string, string>();
  for (const m of mappings) {
    if (mode !== 'revert') lookup.set(m.originalId, m.replacementId);
    else if (!lookup.has(m.replacementId)) lookup.set(m.replacementId, m.originalId);
  }

  const taken = new Set(set.emotes.map((e) => e.id));
  const plan: SwapPlan = { swaps: [], unmapped: 0, alreadyThere: 0 };
  for (const emote of set.emotes) {
    const toId = lookup.get(emote.id);
    if (!toId) plan.unmapped++;
    else if (taken.has(toId)) plan.alreadyThere++;
    else {
      taken.add(toId);
      plan.swaps.push({ alias: emote.alias, fromId: emote.id, toId });
    }
  }
  return plan;
}

/** What one run changed, kept so Undo can reverse exactly that. */
export interface RunRecord {
  id: string;
  at: string;
  mode: RunMode;
  season: SeasonId;
  /** The set the run changed: the source itself, or the copy it filled. */
  setId: string;
  setName: string;
  /** The run created this set, so undoing it means deleting the set. */
  createdSet: boolean;
  swaps: Array<{ fromId: string; toId: string; alias: string; originalAlias: string }>;
  /** Emotes put into an existing set by a duplicate + replace. */
  added: Array<{ id: string; alias: string }>;
}

/**
 * 'refused': 7TV wouldn't take the emote (often its name); the normal emote stands in, and a new name can retry it.
 * 'broken': 7TV no longer has the emote in a usable state; the normal emote stands in for good.
 * 'missing': not even the normal emote would go in, so the set is short this one.
 */
export type ProblemKind = 'refused' | 'broken' | 'missing';

/** One emote a run set aside instead of stopping, kept until it is fixed or dismissed. */
export interface RunProblem {
  id: string;
  runId: string;
  kind: ProblemKind;
  mode: RunMode;
  season: SeasonId;
  setId: string;
  setName: string;
  /** The alias the emote has in the source set. */
  alias: string;
  /** The emote that should be in the set: the seasonal version, or for an unchanged copy the emote itself. */
  emoteId: string;
  /** The swap's normal emote: it stands in under `alias` unless the set is short ('missing'). Null for an unchanged copy. */
  normalId: string | null;
  /** The preset's mapping behind the swap, the right way round even in a revert; null for an unchanged copy. */
  pairing: { originalId: string; replacementId: string } | null;
  /** 7TV's own words. */
  reason: string;
  at: string;
}

export interface RunReport {
  record: RunRecord;
  swapped: number;
  /** Emotes copied unchanged into a duplicate. */
  copied: number;
  failed: Array<{ alias: string; reason: string }>;
  /** Emotes whose swap failed and that couldn't be put back either. */
  lost: string[];
  /** Set when the run had to stop part-way, e.g. the token stopped working. */
  stopped?: string;
}

export type DuplicateTarget = { kind: 'new'; name: string } | { kind: 'existing'; set: EmoteSet };

export interface RunInput {
  mode: RunMode;
  season: SeasonId;
  source: EmoteSet;
  /** The ticked swaps only. */
  swaps: PlannedSwap[];
  /** Where a duplicate + replace puts its copy. */
  target?: DuplicateTarget;
}

export interface RunOptions {
  onProgress?(done: number, total: number): void;
  /** Called after every change, so Undo has a record even if the tab closes mid-run. */
  onRecord?(record: RunRecord): void;
  /** Called the moment an emote is set aside; the run goes straight on with the rest. */
  onProblem?(problem: RunProblem): void;
  /** Awaited after every batch: fixes the user made meanwhile go in here, so writes never overlap. */
  between?(): Promise<void>;
  /** Asks 7TV whether an emote it refused is gone or unusable. */
  checkEmote?(id: string): Promise<EmoteHealth>;
  /** Breathing room between requests, so 7TV's rate limit rarely trips. */
  pauseMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}

/** Nothing was changed: the run couldn't start. */
export class RunNotStarted extends Error {
  constructor(
    message: string,
    readonly kind: 'create-refused' | 'auth' | 'no-owner',
  ) {
    super(message);
    this.name = 'RunNotStarted';
  }
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));
const isAuth = (error: unknown) => error instanceof WriteError && error.kind === 'auth';
const TOKEN_STOPPED =
  '7TV stopped accepting your token part-way. Log out of 7tv.app and log back in, copy the fresh token, then use Undo or run again.';

type ProblemFields = Pick<RunProblem, 'kind' | 'alias' | 'emoteId' | 'normalId' | 'pairing' | 'reason'>;

export async function executeRun(input: RunInput, writer: SetWriter, options: RunOptions = {}): Promise<RunReport> {
  const {
    onProgress,
    onRecord,
    onProblem,
    between,
    checkEmote: check = (id: string) => checkEmote(id),
    pauseMs = 250,
    sleep: wait = sleep,
    now = () => new Date(),
  } = options;
  const pause = () => wait(pauseMs);

  /** A whole batch that failed outright counts as every emote in it failing the same way. */
  const allFailed = (count: number, error: unknown): ItemResult[] =>
    Array.from({ length: count }, () => ({
      ok: false as const,
      error: error instanceof WriteError ? error : new WriteError(reasonOf(error), 'refused'),
    }));

  const record: RunRecord = {
    id: crypto.randomUUID(),
    at: now().toISOString(),
    mode: input.mode,
    season: input.season,
    setId: input.source.id,
    setName: input.source.name,
    createdSet: false,
    swaps: [],
    added: [],
  };
  const report: RunReport = { record, swapped: 0, copied: 0, failed: [], lost: [] };
  const changed = () => onRecord?.({ ...record, swaps: [...record.swaps], added: [...record.added] });

  const setAside = (fields: ProblemFields) =>
    onProblem?.({
      id: crypto.randomUUID(),
      runId: record.id,
      mode: input.mode,
      season: input.season,
      setId: record.setId,
      setName: record.setName,
      at: now().toISOString(),
      ...fields,
    });
  const pairingOf = (swap: PlannedSwap) =>
    input.mode === 'revert'
      ? { originalId: swap.toId, replacementId: swap.fromId }
      : { originalId: swap.fromId, replacementId: swap.toId };
  const kindOf = async (emoteId: string): Promise<ProblemKind> => ((await check(emoteId)) === 'broken' ? 'broken' : 'refused');

  /**
   * The seasonal emote wouldn't go in: put the normal one in its place and set the swap aside.
   * Answers whether the normal emote went in; if the token died meanwhile, the error is rethrown.
   */
  const standIn = async (swap: PlannedSwap, normalId: string, refusal: unknown): Promise<boolean> => {
    const kind = await kindOf(swap.toId);
    await pause();
    try {
      await writer.addEmote(record.setId, normalId, swap.alias);
    } catch (error) {
      report.lost.push(swap.alias);
      if (isAuth(error)) throw error;
      setAside({ kind: 'missing', alias: swap.alias, emoteId: swap.toId, normalId, pairing: pairingOf(swap), reason: reasonOf(error) });
      return false;
    }
    setAside({ kind, alias: swap.alias, emoteId: swap.toId, normalId, pairing: pairingOf(swap), reason: reasonOf(refusal) });
    return true;
  };

  /** After every batch: save, report progress, then let queued fixes in. */
  const batchDone = async (done: number, total: number, save: boolean) => {
    if (save) changed();
    onProgress?.(done, total);
    await between?.();
    await pause();
  };

  if (input.mode !== 'duplicate') {
    const total = input.swaps.length;
    let done = 0;
    for (let start = 0; start < total; start += BATCH_SIZE) {
      const chunk = input.swaps.slice(start, start + BATCH_SIZE);
      let removals: ItemResult[];
      try {
        removals = await writer.removeEmotes(record.setId, chunk.map((s) => ({ emoteId: s.fromId, alias: s.alias })));
      } catch (error) {
        if (isAuth(error)) {
          for (const swap of chunk) report.failed.push({ alias: swap.alias, reason: reasonOf(error) });
          return { ...report, stopped: TOKEN_STOPPED };
        }
        removals = allFailed(chunk.length, error);
      }
      // A swap whose removal failed left the set as it was: the normal emote is still standing in.
      const removed = chunk.filter((swap, i) => {
        const result = removals[i]!;
        if (result.ok) return true;
        report.failed.push({ alias: swap.alias, reason: result.error.message });
        setAside({ kind: 'refused', alias: swap.alias, emoteId: swap.toId, normalId: swap.fromId, pairing: pairingOf(swap), reason: result.error.message });
        return false;
      });

      let additions: ItemResult[] = [];
      let stopped = false;
      if (removed.length) {
        await pause();
        try {
          additions = await writer.addEmotes(record.setId, removed.map((s) => ({ emoteId: s.toId, alias: s.alias })));
        } catch (error) {
          additions = allFailed(removed.length, error);
          stopped = isAuth(error);
        }
      }

      for (const [i, swap] of removed.entries()) {
        const result = additions[i]!;
        if (result.ok) {
          record.swaps.push({ fromId: swap.fromId, toId: swap.toId, alias: swap.alias, originalAlias: swap.alias });
          report.swapped++;
          continue;
        }
        report.failed.push({ alias: swap.alias, reason: result.error.message });
        if (stopped) {
          // The token is gone, so putting the original back would fail too.
          report.lost.push(swap.alias);
          continue;
        }
        try {
          await standIn(swap, swap.fromId, result.error);
        } catch {
          stopped = true;
        }
      }
      if (stopped) {
        if (removed.length) changed();
        return { ...report, stopped: TOKEN_STOPPED };
      }
      done += chunk.length;
      await batchDone(done, total, removed.length > 0);
    }
    return report;
  }

  const target = input.target ?? { kind: 'new', name: input.source.name };
  if (target.kind === 'existing') {
    record.setId = target.set.id;
    record.setName = target.set.name;
  } else {
    const owner = input.source.owner;
    if (!owner) throw new RunNotStarted('7TV doesn’t say who owns this set, so a copy can’t be made for them.', 'no-owner');
    try {
      record.setId = await writer.createSet(owner.id, target.name);
    } catch (error) {
      if (isAuth(error)) throw new RunNotStarted(TOKEN_REJECTED, 'auth');
      throw new RunNotStarted(
        `7TV wouldn’t create a new set (${reasonOf(error)}). Your account may have used all its set slots. Create an empty set on 7TV, then choose it as the target here.`,
        'create-refused',
      );
    }
    record.setName = target.name;
    record.createdSet = true;
    changed();
    await pause();
  }

  const swapFor = new Map(input.swaps.map((s) => [s.fromId, s]));
  const total = input.source.emotes.length;
  const keep = (id: string, alias: string) => {
    // A created set is undone by deleting it; only an existing target needs the list.
    if (!record.createdSet) record.added.push({ id, alias });
  };
  let done = 0;
  for (let start = 0; start < total; start += BATCH_SIZE) {
    const chunk = input.source.emotes.slice(start, start + BATCH_SIZE);
    let results: ItemResult[];
    try {
      results = await writer.addEmotes(
        record.setId,
        chunk.map((e) => ({ emoteId: swapFor.get(e.id)?.toId ?? e.id, alias: e.alias })),
      );
    } catch (error) {
      if (isAuth(error)) {
        for (const emote of chunk) report.failed.push({ alias: emote.alias, reason: reasonOf(error) });
        return { ...report, stopped: TOKEN_STOPPED };
      }
      results = allFailed(chunk.length, error);
    }

    for (const [i, emote] of chunk.entries()) {
      const swap = swapFor.get(emote.id);
      const result = results[i]!;
      if (result.ok) {
        keep(swap?.toId ?? emote.id, emote.alias);
        if (swap) report.swapped++;
        else report.copied++;
        continue;
      }
      report.failed.push({ alias: emote.alias, reason: result.error.message });
      if (!swap) {
        setAside({ kind: 'missing', alias: emote.alias, emoteId: emote.id, normalId: null, pairing: null, reason: result.error.message });
        continue;
      }
      // The seasonal version wouldn't go in: copy the normal emote so the duplicate stays complete.
      try {
        if (await standIn(swap, emote.id, result.error)) {
          keep(emote.id, emote.alias);
          report.copied++;
        }
      } catch {
        if (!record.createdSet) changed();
        return { ...report, stopped: TOKEN_STOPPED };
      }
    }
    done += chunk.length;
    await batchDone(done, total, !record.createdSet);
  }
  return report;
}
