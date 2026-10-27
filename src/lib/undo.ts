import { fetchEmoteSet, type EmoteSet } from '@shared/seventv';
import type { RunRecord } from './run';
import { sleep, type SetWriter } from './seventv-write';

export interface UndoReport {
  restored: number;
  /** Aliases changed since the run, left as they are now. */
  skipped: string[];
  failed: Array<{ alias: string; reason: string }>;
  /** For a run that created its set: whether 7TV let us delete it. */
  deletedSet?: boolean;
}

interface UndoOptions {
  fetchSet?: (id: string) => Promise<EmoteSet>;
  pauseMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Reverses exactly the swaps one run made. The set is read fresh first, and
 * any emote that has changed since the run is skipped rather than overwritten.
 */
export async function undoRun(record: RunRecord, writer: SetWriter, options: UndoOptions = {}): Promise<UndoReport> {
  const { fetchSet = (id: string) => fetchEmoteSet(id), pauseMs = 250, sleep: wait = sleep } = options;
  const report: UndoReport = { restored: 0, skipped: [], failed: [] };

  if (record.createdSet) {
    try {
      await writer.deleteSet(record.setId);
      report.deletedSet = true;
    } catch {
      report.deletedSet = false;
    }
    return report;
  }

  const current = await fetchSet(record.setId);
  const aliasOf = new Map(current.emotes.map((e) => [e.id, e.alias]));

  for (const added of record.added) {
    if (aliasOf.get(added.id) !== added.alias) {
      report.skipped.push(added.alias);
      continue;
    }
    try {
      await writer.removeEmote(record.setId, added.id);
      report.restored++;
    } catch (error) {
      report.failed.push({ alias: added.alias, reason: reasonOf(error) });
    }
    await wait(pauseMs);
  }

  for (const swap of record.swaps) {
    if (aliasOf.get(swap.toId) !== swap.alias || aliasOf.has(swap.fromId)) {
      report.skipped.push(swap.alias);
      continue;
    }
    try {
      await writer.removeEmote(record.setId, swap.toId);
    } catch (error) {
      report.failed.push({ alias: swap.alias, reason: reasonOf(error) });
      continue;
    }
    await wait(pauseMs);
    try {
      await writer.addEmote(record.setId, swap.fromId, swap.originalAlias);
      report.restored++;
    } catch (error) {
      report.failed.push({ alias: swap.alias, reason: reasonOf(error) });
      // Don't leave a gap: put the seasonal emote back where it was.
      await writer.addEmote(record.setId, swap.toId, swap.alias).catch(() => {});
    }
    await wait(pauseMs);
  }
  return report;
}
