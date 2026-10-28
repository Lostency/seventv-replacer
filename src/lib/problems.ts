import { fetchEmoteSet, type EmoteSet } from '@shared/seventv';
import type { RunProblem, RunRecord } from './run';
import type { SetWriter } from './seventv-write';

/** The fix wasn't tried: nothing on 7TV changed. */
export class FixRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FixRefused';
  }
}

/**
 * Tries a set-aside emote again under `name`. A refused emote takes the place of the normal one standing in;
 * a missing one is added. Rejects with 7TV's words if it says no again, leaving the stand-in in place.
 */
export async function fixProblem(
  problem: RunProblem,
  name: string,
  writer: SetWriter,
  fetchSet: (id: string) => Promise<EmoteSet> = (id) => fetchEmoteSet(id),
): Promise<void> {
  if (problem.kind === 'broken') {
    throw new FixRefused('7TV no longer has this emote in a usable state, so it can’t go in. The normal emote stays.');
  }
  const set = await fetchSet(problem.setId);
  const has = (id: string) => set.emotes.find((e) => e.id === id);
  if (has(problem.emoteId)) throw new FixRefused('That emote is already in the set.');

  if (problem.kind === 'missing') {
    await writer.addEmote(problem.setId, problem.emoteId, name);
    return;
  }

  const standIn = problem.normalId ? has(problem.normalId) : undefined;
  if (!standIn) throw new FixRefused('The set changed since the run, so this emote was left alone.');
  await writer.removeEmote(problem.setId, standIn.id, standIn.alias);
  try {
    await writer.addEmote(problem.setId, problem.emoteId, name);
  } catch (error) {
    // Never leave a gap: the stand-in goes back under the name it had.
    await writer.addEmote(problem.setId, standIn.id, standIn.alias).catch(() => {});
    throw error;
  }
}

/** The run's Undo record with a successful fix in it, so Undo reverses the fix along with the run. */
export function recordFix(record: RunRecord, problem: RunProblem, name: string): RunRecord {
  // A created set is undone by deleting it.
  if (record.createdSet) return record;
  if (record.mode === 'duplicate') {
    const added = record.added.filter((a) => problem.kind === 'missing' || a.id !== problem.normalId);
    return { ...record, added: [...added, { id: problem.emoteId, alias: name }] };
  }
  // In place, the run took the normal emote out either way: Undo swaps it back in.
  if (!problem.normalId) return record;
  return {
    ...record,
    swaps: [...record.swaps, { fromId: problem.normalId, toId: problem.emoteId, alias: name, originalAlias: problem.alias }],
  };
}
