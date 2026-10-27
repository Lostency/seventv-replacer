import type { EmoteSet, SetEmote } from '@shared/seventv';
import { isValidAlias } from '../lib/alias';
import { WriteError, type SetWriter } from '../lib/seventv-write';

/** An in-memory 7TV for tests: holds sets, and refuses what the real one refuses. */
export function fakeSevenTv(sets: Record<string, SetEmote[]>, failAdding: string[] = []) {
  const store = new Map(Object.entries(sets).map(([id, emotes]) => [id, [...emotes]]));
  const calls: string[] = [];
  let created = 0;
  const writer: SetWriter & { refuseCreate?: boolean; refuseDelete?: boolean; expireTokenAfter?: number } = {
    async addEmote(setId, id, alias) {
      calls.push(`add ${id} ${alias}`);
      if (writer.expireTokenAfter !== undefined && calls.length > writer.expireTokenAfter) {
        throw new WriteError('7TV didn’t accept your token.', 'auth');
      }
      const set = store.get(setId)!;
      if (!isValidAlias(alias)) throw new WriteError('Invalid emote name', 'refused');
      if (failAdding.includes(id)) throw new WriteError('Emote is private', 'refused');
      if (set.some((e) => e.id === id || e.alias === alias)) throw new WriteError('Conflict', 'refused');
      set.push({ id, alias });
    },
    async removeEmote(setId, id) {
      calls.push(`remove ${id}`);
      if (writer.expireTokenAfter !== undefined && calls.length > writer.expireTokenAfter) {
        throw new WriteError('7TV didn’t accept your token.', 'auth');
      }
      store.set(setId, store.get(setId)!.filter((e) => e.id !== id));
    },
    async createSet(_owner, name) {
      calls.push(`create ${name}`);
      if (writer.refuseCreate) throw new WriteError('Maximum emote sets reached', 'refused');
      const id = `NEW${++created}`;
      store.set(id, []);
      return id;
    },
    async deleteSet(id) {
      calls.push(`delete ${id}`);
      if (writer.refuseDelete) throw new WriteError('Not allowed', 'refused');
      store.delete(id);
    },
  };
  const read = async (id: string): Promise<EmoteSet> => ({
    id,
    name: id,
    owner: { id: 'U1', name: 'niena' },
    capacity: 1000,
    emotes: [...(store.get(id) ?? [])],
  });
  return { writer, read, store, calls };
}
