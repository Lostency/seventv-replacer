import { describe, expect, it } from 'vitest';
import { currentSeason, isSeasonId, seasonLabel } from './seasons';

describe('seasons', () => {
  it('labels seasons', () => expect(seasonLabel('winter')).toBe('Winter'));
  it('rejects unknown ids', () => expect(isSeasonId('easter')).toBe(false));
  it('accepts known ids', () => expect(isSeasonId('halloween')).toBe(true));
  it.each([
    ['2026-10-27', 'halloween'],
    ['2026-09-15', 'halloween'],
    ['2026-11-05', 'halloween'],
    ['2026-11-06', 'winter'],
    ['2027-01-15', 'winter'],
    ['2027-01-16', 'halloween'],
  ])('currentSeason(%s) is %s', (iso, season) => {
    expect(currentSeason(new Date(`${iso}T12:00:00`))).toBe(season);
  });
});
