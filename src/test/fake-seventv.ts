import type { EmoteSet, SetEmote } from '@shared/seventv';
import { WriteError, type EmoteRef, type ItemResult, type SetWriter } from '../lib/seventv-write';

type FakeWriter = SetWriter & { refuseCreate?: boolean; refuseDelete?: boolean; expireTokenAfter?: number };

/** An in-memory 7TV for tests: holds sets, and refuses what the real one refuses. */
export function fakeSevenTv(sets: Record<string, SetEmote[]>, failAdding: string[] = []) {
  const store = new Map(Object.entries(sets).map(([id, emotes]) => [id, [...emotes]]));
  const calls: string[] = [];
  let created = 0;

  const checkToken = () => {
    if (writer.expireTokenAfter !== undefined && calls.length > writer.expireTokenAfter) {
      throw new WriteError('7TV didn’t accept your token.', 'auth');
    }
  };

  const add = (setId: string, { emoteId: id, alias }: EmoteRef) => {
    const set = store.get(setId)!;
    // Like 7TV: umlauts, accents, & . * are fine; commas and spaces are not.
    if (/[,\s]/.test(alias)) throw new WriteError('Invalid emote name', 'refused');
    if (failAdding.includes(id)) throw new WriteError('Emote is private', 'refused');
    if (set.some((e) => e.id === id || e.alias === alias)) throw new WriteError('Conflict', 'refused');
    set.push({ id, alias });
  };
  const remove = (setId: string, { emoteId }: EmoteRef) => {
    store.set(setId, store.get(setId)!.filter((e) => e.id !== emoteId));
  };

  /** One request: a token that has expired fails the whole batch, anything else fails per emote. */
  const batch = (op: (setId: string, e: EmoteRef) => void, label: string, setId: string, emotes: EmoteRef[]) => {
    calls.push(`${label} ${emotes.map((e) => `${e.emoteId}:${e.alias}`).join(' ')}`);
    checkToken();
    return emotes.map((e): ItemResult => {
      try {
        op(setId, e);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error as WriteError };
      }
    });
  };

  const writer: FakeWriter = {
    async addEmotes(setId, emotes) {
      return batch(add, 'add', setId, emotes);
    },
    async removeEmotes(setId, emotes) {
      return batch(remove, 'remove', setId, emotes);
    },
    async addEmote(setId, emoteId, alias) {
      const [result] = batch(add, 'add', setId, [{ emoteId, alias }]);
      if (!result!.ok) throw result!.error;
    },
    async removeEmote(setId, emoteId, alias) {
      const [result] = batch(remove, 'remove', setId, [{ emoteId, alias }]);
      if (!result!.ok) throw result!.error;
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
