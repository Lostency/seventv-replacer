import type { SeasonId } from '@shared/seasons';
import type { EmoteSet } from '@shared/seventv';
import type { MappingRow } from '@shared/types';
import { suggestAlias } from './alias';
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

export interface RunReport {
  record: RunRecord;
  swapped: number;
  /** Emotes copied unchanged into a duplicate. */
  copied: number;
  failed: Array<{ alias: string; reason: string }>;
  renamed: Array<{ from: string; to: string }>;
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

/** 7TV refused a name: what the run asks the user before going on. */
export interface AliasQuestion {
  alias: string;
  emoteId: string;
  /** 7TV's own words. */
  reason: string;
  suggestion: string;
  /** The emote going in: its seasonal version, or the normal one being put back or copied. */
  role: 'seasonal' | 'normal';
}

export interface RunOptions {
  onProgress?(done: number, total: number): void;
  /** Called after every change, so Undo has a record even if the tab closes mid-run. */
  onRecord?(record: RunRecord): void;
  /** Resolves to the name to try next, or null to skip the emote. Without it, a refused name fails the emote. */
  askAlias?(question: AliasQuestion): Promise<string | null>;
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

export async function executeRun(input: RunInput, writer: SetWriter, options: RunOptions = {}): Promise<RunReport> {
  const { onProgress, onRecord, askAlias, pauseMs = 250, sleep: wait = sleep, now = () => new Date() } = options;
  const pause = () => wait(pauseMs);

  /**
   * 7TV refused an emote under its current spelling: ask the user for another
   * name (or to skip) and keep trying until one goes in or they skip.
   */
  const resolveRefusal = async (
    setId: string,
    emoteId: string,
    alias: string,
    role: AliasQuestion['role'],
    refusal: unknown,
  ): Promise<string> => {
    let name = alias;
    let error = refusal;
    for (;;) {
      if (!askAlias || !(error instanceof WriteError) || error.kind !== 'refused') throw error;
      const answer = await askAlias({ alias: name, emoteId, reason: error.message, suggestion: suggestAlias(name), role });
      if (!answer?.trim()) throw error;
      name = answer.trim();
      await pause();
      try {
        await writer.addEmote(setId, emoteId, name);
        return name;
      } catch (next) {
        error = next;
      }
    }
  };

  /** Adds one emote under its current spelling, asking the user if 7TV refuses it. */
  const addAsking = async (setId: string, emoteId: string, alias: string, role: AliasQuestion['role']) => {
    try {
      await writer.addEmote(setId, emoteId, alias);
      return alias;
    } catch (error) {
      return resolveRefusal(setId, emoteId, alias, role, error);
    }
  };

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
  const report: RunReport = { record, swapped: 0, copied: 0, failed: [], renamed: [], lost: [] };
  const noteRename = (from: string, to: string) => {
    if (from !== to) report.renamed.push({ from, to });
  };
  const changed = () => onRecord?.({ ...record, swaps: [...record.swaps], added: [...record.added] });

  if (input.mode !== 'duplicate') {
    const total = input.swaps.length;
    let done = 0;
    for (let start = 0; start < total; start += BATCH_SIZE) {
      const chunk = input.swaps.slice(start, start + BATCH_SIZE);
      let removals: ItemResult[];
      try {
        removals = await writer.removeEmotes(record.setId, chunk.map((s) => ({ emoteId: s.fromId, alias: s.alias })));
      } catch (error) {
        for (const swap of chunk) report.failed.push({ alias: swap.alias, reason: reasonOf(error) });
        if (isAuth(error)) return { ...report, stopped: TOKEN_STOPPED };
        removals = allFailed(chunk.length, error);
      }
      const removed = chunk.filter((swap, i) => {
        const result = removals[i]!;
        if (!result.ok) report.failed.push({ alias: swap.alias, reason: result.error.message });
        return result.ok;
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
        try {
          if (stopped) throw result.error;
          const name = await resolveRefusal(record.setId, swap.toId, swap.alias, 'seasonal', result.error);
          record.swaps.push({ fromId: swap.fromId, toId: swap.toId, alias: name, originalAlias: swap.alias });
          report.swapped++;
          noteRename(swap.alias, name);
        } catch (error) {
          report.failed.push({ alias: swap.alias, reason: reasonOf(error) });
          // The ADD half failed: put the original back so the set never ends up short.
          try {
            await pause();
            const name = await addAsking(record.setId, swap.fromId, swap.alias, 'normal');
            noteRename(swap.alias, name);
          } catch {
            report.lost.push(swap.alias);
          }
        }
      }
      if (removed.length) changed();
      if (stopped) return { ...report, stopped: TOKEN_STOPPED };
      done += chunk.length;
      onProgress?.(done, total);
      await pause();
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
      const id = swap?.toId ?? emote.id;
      const result = results[i]!;
      if (result.ok) {
        keep(id, emote.alias);
        if (swap) report.swapped++;
        else report.copied++;
        continue;
      }
      try {
        const name = await resolveRefusal(record.setId, id, emote.alias, swap ? 'seasonal' : 'normal', result.error);
        keep(id, name);
        if (swap) report.swapped++;
        else report.copied++;
        noteRename(emote.alias, name);
      } catch (error) {
        report.failed.push({ alias: emote.alias, reason: reasonOf(error) });
        if (isAuth(error)) return { ...report, stopped: TOKEN_STOPPED };
        // The seasonal version wouldn't go in: copy the normal emote so the duplicate stays complete.
        if (swap) {
          try {
            await pause();
            const name = await addAsking(record.setId, emote.id, emote.alias, 'normal');
            keep(emote.id, name);
            report.copied++;
            noteRename(emote.alias, name);
          } catch {
            report.lost.push(emote.alias);
          }
        }
      }
    }
    if (!record.createdSet) changed();
    done += chunk.length;
    onProgress?.(done, total);
    await pause();
  }
  return report;
}
