import { Hono } from 'hono';
import { isSeasonId } from '../../shared/seasons';
import type { MappingRow, PresetResponse } from '../../shared/types';
import type { Env } from '../env';
import { PUBLIC_CACHE } from './cache';

export const presets = new Hono<{ Bindings: Env }>();

presets.get('/:season', async (c) => {
  const season = c.req.param('season');
  if (!isSeasonId(season)) return c.json({ error: 'Unknown season' }, 404);

  const { results } = await c.env.DB.prepare(
    `SELECT original_id AS originalId, replacement_id AS replacementId
       FROM mappings WHERE season = ? ORDER BY original_id`,
  )
    .bind(season)
    .all<MappingRow>();

  const body: PresetResponse = { season, mappings: results };
  return c.json(body, 200, PUBLIC_CACHE);
});
