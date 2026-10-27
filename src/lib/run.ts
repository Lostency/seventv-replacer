import type { SeasonId } from '@shared/seasons';
import type { EmoteSet } from '@shared/seventv';
import type { MappingRow } from '@shared/types';
import { isValidAlias, transliterate } from './alias';
import { sleep, TOKEN_REJECTED, WriteError, type SetWriter } from './seventv-write';

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

export interface RunOptions {
  onProgress?(done: number, total: number): void;
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
  const { onProgress, pauseMs = 250, sleep: wait = sleep, now = () => new Date() } = options;
  const pause = () => wait(pauseMs);

  /** Adds under the alias; if 7TV refuses a name it can't hold, retries once with it spelled out. */
  const addWithAlias = async (setId: string, emoteId: string, alias: string): Promise<string> => {
    try {
      await writer.addEmote(setId, emoteId, alias);
      return alias;
    } catch (error) {
      const retry = error instanceof WriteError && error.kind === 'refused' && !isValidAlias(alias) ? transliterate(alias) : null;
      if (!retry) throw error;
      await pause();
      await writer.addEmote(setId, emoteId, retry);
      return retry;
    }
  };

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

  if (input.mode !== 'duplicate') {
    const total = input.swaps.length;
    for (const [i, swap] of input.swaps.entries()) {
      try {
        await writer.removeEmote(record.setId, swap.fromId);
      } catch (error) {
        report.failed.push({ alias: swap.alias, reason: reasonOf(error) });
        if (isAuth(error)) return { ...report, stopped: TOKEN_STOPPED };
        onProgress?.(i + 1, total);
        continue;
      }
      await pause();
      try {
        const alias = await addWithAlias(record.setId, swap.toId, swap.alias);
        record.swaps.push({ fromId: swap.fromId, toId: swap.toId, alias, originalAlias: swap.alias });
        report.swapped++;
        noteRename(swap.alias, alias);
      } catch (error) {
        report.failed.push({ alias: swap.alias, reason: reasonOf(error) });
        // The ADD half failed: put the original back so the set never ends up short.
        try {
          await pause();
          await writer.addEmote(record.setId, swap.fromId, swap.alias);
        } catch {
          report.lost.push(swap.alias);
        }
        if (isAuth(error)) return { ...report, stopped: TOKEN_STOPPED };
      }
      onProgress?.(i + 1, total);
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
    await pause();
  }

  const swapFor = new Map(input.swaps.map((s) => [s.fromId, s]));
  const total = input.source.emotes.length;
  for (const [i, emote] of input.source.emotes.entries()) {
    const swap = swapFor.get(emote.id);
    try {
      const alias = await addWithAlias(record.setId, swap?.toId ?? emote.id, emote.alias);
      record.added.push({ id: swap?.toId ?? emote.id, alias });
      if (swap) report.swapped++;
      else report.copied++;
      noteRename(emote.alias, alias);
    } catch (error) {
      report.failed.push({ alias: emote.alias, reason: reasonOf(error) });
      if (isAuth(error)) return { ...report, stopped: TOKEN_STOPPED };
      // The seasonal version wouldn't go in: copy the normal emote so the duplicate stays complete.
      if (swap) {
        try {
          await pause();
          const alias = await addWithAlias(record.setId, emote.id, emote.alias);
          record.added.push({ id: emote.id, alias });
          report.copied++;
        } catch {
          report.lost.push(emote.alias);
        }
      }
    }
    onProgress?.(i + 1, total);
    await pause();
  }
  // A created set is undone by deleting it; only an existing target needs the list.
  if (record.createdSet) record.added = [];
  return report;
}
