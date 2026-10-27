export const SEASONS = ['halloween', 'winter'] as const;

export type SeasonId = (typeof SEASONS)[number];

const LABELS: Record<SeasonId, string> = {
  halloween: 'Halloween',
  winter: 'Winter',
};

export function isSeasonId(value: unknown): value is SeasonId {
  return typeof value === 'string' && (SEASONS as readonly string[]).includes(value);
}

export function seasonLabel(id: SeasonId): string {
  return LABELS[id];
}

/**
 * The season a visitor most likely wants today, in their local calendar:
 * Winter from 6 Nov to 15 Jan, Halloween the rest of the year.
 */
export function currentSeason(date: Date): SeasonId {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const winter = (month === 11 && day >= 6) || month === 12 || (month === 1 && day <= 15);
  return winter ? 'winter' : 'halloween';
}
