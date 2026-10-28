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

export interface MeResponse {
  user: { login: string; displayName: string; admin: boolean } | null;
  /** False until the server has a Twitch application configured. */
  signInAvailable: boolean;
}

export interface SetRef {
  id: string;
  name: string;
  owner: string | null;
}

/** When a pair of sets was last submitted, and when it can be submitted again. */
export interface Cooldown {
  comparedOn: string;
  availableFrom: string;
}

export interface ComparisonPreviewRequest {
  normalSetId: string;
  seasonalSetId: string;
}

export interface ComparisonPreview {
  normal: SetRef;
  seasonal: SetRef;
  /** The channel the comparison counts for: the owner of the normal set. */
  channel: string | null;
  matches: Array<{ alias: string; originalId: string; replacementId: string }>;
  cooldown: Cooldown | null;
}

export interface ComparisonSubmitRequest extends ComparisonPreviewRequest {
  season: SeasonId;
  /** Matches the user unticked. Everything else the server finds is recorded. */
  excluded: Array<{ originalId: string; replacementId: string }>;
}

export interface ComparisonSubmitted {
  channel: string;
  sightings: number;
  cooldown: Cooldown;
}

/** A pairing enough channels made by hand, waiting for an admin. */
export interface Candidate {
  originalId: string;
  replacementId: string;
  /** The alias the channels use; both sides share it. */
  alias: string;
  /** Distinct channels whose comparisons show this pairing. */
  channels: number;
  /** The original's current mapping in this season, when it points to another emote. */
  current: string | null;
}

export interface ReviewResponse {
  season: SeasonId;
  threshold: number;
  candidates: Candidate[];
}

/** Where a mapping came from: the original presets, the review queue, or two pasted links. */
export type MappingSource = 'seed' | 'review' | 'manual';

export interface AdminMapping extends MappingRow {
  source: MappingSource;
  createdAt: string;
}

export interface AdminMappingsResponse {
  season: SeasonId;
  mappings: AdminMapping[];
}

export interface MappingWrite {
  season: SeasonId;
  originalId: string;
  replacementId: string;
  source: MappingSource;
}

/** The mapping the write replaced, so Undo can put it back. */
export interface MappingWritten {
  previous: AdminMapping | null;
}

export interface MappingDeleted {
  deleted: AdminMapping | null;
}

export interface RejectionRequest {
  season: SeasonId;
  originalId: string;
  replacementId: string;
}

/** Settles every option for one emote: maps `replacementId` (null keeps the current mapping), rejects `rejectIds`. */
export interface DecisionRequest {
  season: SeasonId;
  originalId: string;
  replacementId: string | null;
  rejectIds: string[];
}

export interface ApiError {
  error: string;
  cooldown?: Cooldown;
}
