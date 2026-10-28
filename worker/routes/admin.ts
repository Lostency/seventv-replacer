import { Hono } from 'hono';
import { z } from 'zod';
import { isSeasonId, SEASONS } from '../../shared/seasons';
import type {
  AdminMapping,
  AdminMappingsResponse,
  ApiError,
  MappingDeleted,
  MappingWritten,
  ReviewResponse,
} from '../../shared/types';
import { getThreshold, listCandidates, setThreshold } from '../candidates';
import { requireAdmin, type AppEnv } from '../session';

const NO_STORE = { 'Cache-Control': 'no-store' };
const MAPPING_COLUMNS = 'original_id AS originalId, replacement_id AS replacementId, source, created_at AS createdAt';

const emoteId = z.string().min(1).max(40);
const pairing = z.object({ season: z.enum(SEASONS), originalId: emoteId, replacementId: emoteId });
const mappingBody = pairing.extend({ source: z.enum(['seed', 'review', 'manual']) });
const thresholdBody = z.object({ threshold: z.number().int().min(1).max(50) });
const decisionBody = z
  .object({
    season: z.enum(SEASONS),
    originalId: emoteId,
    replacementId: emoteId.nullable(),
    rejectIds: z.array(emoteId).max(50),
  })
  .refine(({ replacementId, rejectIds }) => replacementId !== null || rejectIds.length > 0)
  .refine(({ originalId, replacementId }) => replacementId !== originalId)
  .refine(({ replacementId, rejectIds }) => replacementId === null || !rejectIds.includes(replacementId));

export const admin = new Hono<AppEnv>();

admin.use('*', requireAdmin);

admin.get('/review/:season', async (c) => {
  const season = c.req.param('season');
  if (!isSeasonId(season)) return c.json<ApiError>({ error: 'Unknown season' }, 404);
  const threshold = await getThreshold(c.env.DB);
  const body: ReviewResponse = { season, threshold, candidates: await listCandidates(c.env.DB, season, threshold) };
  return c.json(body, 200, NO_STORE);
});

admin.put('/threshold', async (c) => {
  const parsed = thresholdBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json<ApiError>({ error: 'Use a whole number from 1 to 50.' }, 400);
  await setThreshold(c.env.DB, parsed.data.threshold);
  return c.json({ threshold: parsed.data.threshold }, 200, NO_STORE);
});

admin.get('/mappings/:season', async (c) => {
  const season = c.req.param('season');
  if (!isSeasonId(season)) return c.json<ApiError>({ error: 'Unknown season' }, 404);
  const { results } = await c.env.DB.prepare(`SELECT ${MAPPING_COLUMNS} FROM mappings WHERE season = ? ORDER BY original_id`)
    .bind(season)
    .all<AdminMapping>();
  const body: AdminMappingsResponse = { season, mappings: results };
  return c.json(body, 200, NO_STORE);
});

/** Adds a mapping, or replaces the original's current one; answers with what it replaced. */
admin.put('/mappings', async (c) => {
  const parsed = mappingBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json<ApiError>({ error: 'Pick a season and two emotes, then try again.' }, 400);
  const { season, originalId, replacementId, source } = parsed.data;
  if (originalId === replacementId) return c.json<ApiError>({ error: 'Pick two different emotes.' }, 400);

  const db = c.env.DB;
  const [before] = await db.batch<AdminMapping>([
    db.prepare(`SELECT ${MAPPING_COLUMNS} FROM mappings WHERE season = ? AND original_id = ?`).bind(season, originalId),
    db
      .prepare(
        `INSERT INTO mappings (id, season, original_id, replacement_id, source) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (season, original_id) DO UPDATE SET replacement_id = excluded.replacement_id, source = excluded.source`,
      )
      .bind(crypto.randomUUID(), season, originalId, replacementId, source),
  ]);
  const body: MappingWritten = { previous: before?.results[0] ?? null };
  return c.json(body, 200, NO_STORE);
});

/**
 * Settles every option for one emote at once: maps `replacementId` (null keeps the current mapping)
 * and rejects `rejectIds`, all or nothing. Answers with the mapping it replaced, so Undo can put it back.
 */
admin.post('/decisions', async (c) => {
  const parsed = decisionBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json<ApiError>({ error: 'Pick one option to keep, then try again.' }, 400);
  const { season, originalId, replacementId, rejectIds } = parsed.data;

  const db = c.env.DB;
  const rejectedBy = c.get('user').twitchId;
  const [before] = await db.batch<AdminMapping>([
    db.prepare(`SELECT ${MAPPING_COLUMNS} FROM mappings WHERE season = ? AND original_id = ?`).bind(season, originalId),
    ...(replacementId === null
      ? []
      : [
          db
            .prepare(
              `INSERT INTO mappings (id, season, original_id, replacement_id, source) VALUES (?, ?, ?, ?, 'review')
               ON CONFLICT (season, original_id) DO UPDATE SET replacement_id = excluded.replacement_id, source = excluded.source`,
            )
            .bind(crypto.randomUUID(), season, originalId, replacementId),
        ]),
    ...rejectIds.map((id) =>
      db
        .prepare('INSERT OR IGNORE INTO rejections (season, original_id, replacement_id, rejected_by) VALUES (?, ?, ?, ?)')
        .bind(season, originalId, id, rejectedBy),
    ),
  ]);
  const body: MappingWritten = { previous: replacementId === null ? null : (before?.results[0] ?? null) };
  return c.json(body, 200, NO_STORE);
});

admin.delete('/mappings/:season/:originalId', async (c) => {
  const { season, originalId } = c.req.param();
  if (!isSeasonId(season)) return c.json<ApiError>({ error: 'Unknown season' }, 404);
  const deleted = await c.env.DB.prepare(`DELETE FROM mappings WHERE season = ? AND original_id = ? RETURNING ${MAPPING_COLUMNS}`)
    .bind(season, originalId)
    .first<AdminMapping>();
  const body: MappingDeleted = { deleted: deleted ?? null };
  return c.json(body, 200, NO_STORE);
});

admin.post('/rejections', async (c) => {
  const parsed = pairing.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json<ApiError>({ error: 'Pick a season and two emotes, then try again.' }, 400);
  const { season, originalId, replacementId } = parsed.data;
  await c.env.DB.prepare(
    'INSERT OR IGNORE INTO rejections (season, original_id, replacement_id, rejected_by) VALUES (?, ?, ?, ?)',
  )
    .bind(season, originalId, replacementId, c.get('user').twitchId)
    .run();
  return c.json({}, 201, NO_STORE);
});

/** Only the Undo toast calls this: rejections are otherwise permanent. */
admin.delete('/rejections/:season/:originalId/:replacementId', async (c) => {
  const { season, originalId, replacementId } = c.req.param();
  await c.env.DB.prepare('DELETE FROM rejections WHERE season = ? AND original_id = ? AND replacement_id = ?')
    .bind(season, originalId, replacementId)
    .run();
  return c.body(null, 204);
});
