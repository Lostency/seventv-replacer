import type { SeasonId } from './seasons';

/** One original → seasonal emote pairing, by 7TV emote ID. */
export interface MappingRow {
  originalId: string;
  replacementId: string;
}

/** A season's mappings as stored in data/presets/<season>.json. */
export interface PresetFile {
  season: SeasonId;
  mappings: MappingRow[];
}

export interface PresetResponse {
  season: SeasonId;
  mappings: MappingRow[];
}

export interface StatsResponse {
  mappings: Record<SeasonId, number>;
}
