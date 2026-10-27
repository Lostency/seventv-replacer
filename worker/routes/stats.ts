import { Hono } from 'hono';
import { SEASONS, type SeasonId } from '../../shared/seasons';
import type { StatsResponse } from '../../shared/types';
import type { Env } from '../env';
import { PUBLIC_CACHE } from './cache';

export const stats = new Hono<{ Bindings: Env }>();

stats.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT season, COUNT(*) AS count FROM mappings GROUP BY season',
  ).all<{ season: string; count: number }>();

  const mappings = Object.fromEntries(SEASONS.map((s) => [s, 0])) as Record<SeasonId, number>;
  for (const { season, count } of results) {
    if (season in mappings) mappings[season as SeasonId] = count;
  }

  const body: StatsResponse = { mappings };
  return c.json(body, 200, PUBLIC_CACHE);
});
