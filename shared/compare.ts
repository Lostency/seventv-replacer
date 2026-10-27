import type { EmoteSet } from './seventv';

/** An alias that holds one emote in the normal set and a different one in the seasonal set. */
export interface SetMatch {
  alias: string;
  originalId: string;
  replacementId: string;
}

export interface Pairing {
  originalId: string;
  replacementId: string;
}

export const pairingKey = (p: Pairing) => `${p.originalId}>${p.replacementId}`;

/**
 * Same alias (ignoring case) in both sets with a different emote ID is a sighting.
 * The same emote under the same alias is not, and emotes in only one set are ignored.
 */
export function matchSets(normal: EmoteSet, seasonal: EmoteSet): SetMatch[] {
  const seasonalByAlias = new Map<string, string>();
  for (const emote of seasonal.emotes) {
    const key = emote.alias.toLowerCase();
    if (!seasonalByAlias.has(key)) seasonalByAlias.set(key, emote.id);
  }

  const seen = new Set<string>();
  const matches: SetMatch[] = [];
  for (const emote of normal.emotes) {
    const replacementId = seasonalByAlias.get(emote.alias.toLowerCase());
    if (!replacementId || replacementId === emote.id) continue;
    const match = { alias: emote.alias, originalId: emote.id, replacementId };
    if (seen.has(pairingKey(match))) continue;
    seen.add(pairingKey(match));
    matches.push(match);
  }
  return matches.sort((a, b) => a.alias.localeCompare(b.alias, 'en', { sensitivity: 'base' }));
}
