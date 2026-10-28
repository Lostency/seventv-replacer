import { Hono } from 'hono';
import { z } from 'zod';
import { SEASONS } from '../../shared/seasons';
import { checkEmote } from '../../shared/seventv';
import type { ApiError } from '../../shared/types';
import type { Env } from '../env';

const emoteId = z.string().min(1).max(40);
export const brokenReport = z
  .object({
    season: z.enum(SEASONS),
    originalId: emoteId,
    replacementId: emoteId,
    brokenId: emoteId,
    reason: z.string().trim().min(1).max(300),
  })
  .refine(({ originalId, replacementId, brokenId }) => brokenId === originalId || brokenId === replacementId);

export const broken = new Hono<{ Bindings: Env }>();

/**
 * A Replace run found an emote gone or unusable. Anyone may report, so a report only counts for a pairing
 * in the preset, and only once 7TV itself confirms the emote is broken. Always 202: the sender has nothing to do.
 */
broken.post('/', async (c) => {
  const parsed = brokenReport.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json<ApiError>({ error: 'That report doesn’t name a mapping.' }, 400);
  const { season, originalId, replacementId, brokenId, reason } = parsed.data;

  const db = c.env.DB;
  const mapped = await db
    .prepare('SELECT 1 FROM mappings WHERE season = ? AND original_id = ? AND replacement_id = ?')
    .bind(season, originalId, replacementId)
    .first();
  if (mapped && (await checkEmote(brokenId)) === 'broken') {
    await db
      .prepare(
        `INSERT INTO broken_reports (season, original_id, replacement_id, broken_id, reason) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (season, original_id, replacement_id) DO UPDATE SET
           broken_id = excluded.broken_id, reason = excluded.reason, reports = reports + 1, last_seen = datetime('now')`,
      )
      .bind(season, originalId, replacementId, brokenId, reason)
      .run();
  }
  return c.body(null, 202);
});
