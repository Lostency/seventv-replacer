import { Hono } from 'hono';
import { z } from 'zod';
import { SEASONS } from '../../shared/seasons';
import type {
  AdminComparison,
  AdminComparisonsResponse,
  ApiError,
  BlockedSubmitter,
  ComparisonMoved,
  ComparisonsDiscarded,
  SubmitterGroup,
} from '../../shared/types';
import { isAdmin, type AppEnv } from '../session';

const NO_STORE = { 'Cache-Control': 'no-store' };
const COMPARISON_COLUMNS = `id, channel_name AS channelName, normal_set_id AS normalSetId, normal_set_name AS normalSetName,
  seasonal_set_id AS seasonalSetId, seasonal_set_name AS seasonalSetName, season, match_count AS matches, submitted_at AS submittedAt`;
const BLOCKED_COLUMNS = 'twitch_id AS twitchId, login, display_name AS displayName, blocked_at AS blockedAt';
const GONE: ApiError = { error: 'That comparison is gone.' };

const moveBody = z.object({ season: z.enum(SEASONS) });

type ComparisonRow = AdminComparison & { submittedBy: string; login: string | null; displayName: string | null };

/** Admin-only (mounted inside the `admin` router): submitted comparisons and their submitters. */
export const comparisonsAdmin = new Hono<AppEnv>();

comparisonsAdmin.get('/comparisons', async (c) => {
  const db = c.env.DB;
  const [comparisons, blocked] = await db.batch([
    db.prepare(
      `SELECT ${COMPARISON_COLUMNS}, submitted_by AS submittedBy, submitter_login AS login, submitter_name AS displayName
         FROM comparisons ORDER BY submitted_at DESC, id`,
    ),
    db.prepare(`SELECT ${BLOCKED_COLUMNS} FROM blocked_submitters ORDER BY blocked_at DESC`),
  ]);

  // Rows come newest first, so groups appear in order of their latest submission.
  const groups = new Map<string, SubmitterGroup>();
  for (const { submittedBy, login, displayName, ...comparison } of comparisons!.results as ComparisonRow[]) {
    let group = groups.get(submittedBy);
    if (!group) {
      group = { twitchId: submittedBy, login: null, displayName: null, admin: false, matches: 0, latest: comparison.submittedAt, comparisons: [] };
      groups.set(submittedBy, group);
    }
    group.login ??= login;
    group.displayName ??= displayName;
    group.matches += comparison.matches;
    group.comparisons.push(comparison);
  }
  for (const group of groups.values()) group.admin = group.login !== null && isAdmin(c.env, group.login);

  const body: AdminComparisonsResponse = { submitters: [...groups.values()], blocked: blocked!.results as BlockedSubmitter[] };
  return c.json(body, 200, NO_STORE);
});

/** Moves a comparison and every one of its sightings to another season, together. */
comparisonsAdmin.put('/comparisons/:id/season', async (c) => {
  const parsed = moveBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json<ApiError>({ error: 'Pick a season, then try again.' }, 400);
  const { season } = parsed.data;
  const id = c.req.param('id');

  const db = c.env.DB;
  const [moved] = await db.batch<AdminComparison>([
    db.prepare(`UPDATE comparisons SET season = ? WHERE id = ? RETURNING ${COMPARISON_COLUMNS}`).bind(season, id),
    db.prepare('UPDATE sightings SET season = ? WHERE comparison_id = ?').bind(season, id),
  ]);
  const comparison = moved?.results[0];
  if (!comparison) return c.json(GONE, 404);
  const body: ComparisonMoved = { comparison };
  return c.json(body, 200, NO_STORE);
});

const discardBody = z.object({ block: z.boolean() });

/** Discards every comparison one submitter sent and, with `block`, stops them submitting again. */
comparisonsAdmin.post('/submitters/:twitchId/discard', async (c) => {
  const parsed = discardBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json<ApiError>({ error: 'Say whether to block them, then try again.' }, 400);
  const { block } = parsed.data;
  const twitchId = c.req.param('twitchId');

  const db = c.env.DB;
  const found = await db
    .prepare(
      `SELECT COUNT(*) AS comparisons, COALESCE(SUM(match_count), 0) AS matches,
              (SELECT submitter_login FROM comparisons WHERE submitted_by = ?1 AND submitter_login IS NOT NULL
                ORDER BY submitted_at DESC LIMIT 1) AS login
         FROM comparisons WHERE submitted_by = ?1`,
    )
    .bind(twitchId)
    .first<{ comparisons: number; matches: number; login: string | null }>();
  if (!found?.comparisons) return c.json<ApiError>({ error: 'Nothing to discard.' }, 404);
  if (block && found.login !== null && isAdmin(c.env, found.login)) {
    return c.json<ApiError>({ error: 'Admins can’t be blocked.' }, 403);
  }

  // The counts are read again inside the batch: another admin's discard may have landed since the check above.
  const [counted, blocked] = await db.batch<{ comparisons: number; matches: number } & BlockedSubmitter>([
    db
      .prepare('SELECT COUNT(*) AS comparisons, COALESCE(SUM(match_count), 0) AS matches FROM comparisons WHERE submitted_by = ?')
      .bind(twitchId),
    // Before the deletes, so it can still read the submitter's newest name.
    ...(block
      ? [
          db
            .prepare(
              `INSERT OR REPLACE INTO blocked_submitters (twitch_id, login, display_name, blocked_by)
               SELECT submitted_by, submitter_login, submitter_name, ? FROM comparisons
                WHERE submitted_by = ? ORDER BY submitted_at DESC LIMIT 1
               RETURNING ${BLOCKED_COLUMNS}`,
            )
            .bind(c.get('user').twitchId, twitchId),
        ]
      : []),
    db.prepare('DELETE FROM sightings WHERE comparison_id IN (SELECT id FROM comparisons WHERE submitted_by = ?)').bind(twitchId),
    db.prepare('DELETE FROM comparisons WHERE submitted_by = ?').bind(twitchId),
  ]);
  const done = counted?.results[0];
  if (!done?.comparisons) return c.json<ApiError>({ error: 'Nothing to discard.' }, 404);
  const body: ComparisonsDiscarded = {
    comparisons: done.comparisons,
    matches: done.matches,
    blocked: block ? (blocked?.results[0] ?? null) : null,
  };
  return c.json(body, 200, NO_STORE);
});

comparisonsAdmin.delete('/blocked/:twitchId', async (c) => {
  await c.env.DB.prepare('DELETE FROM blocked_submitters WHERE twitch_id = ?').bind(c.req.param('twitchId')).run();
  return c.body(null, 204);
});

comparisonsAdmin.delete('/comparisons/:id', async (c) => {
  const id = c.req.param('id');
  const db = c.env.DB;
  const [found] = await db.batch<{ matches: number }>([
    db.prepare('SELECT match_count AS matches FROM comparisons WHERE id = ?').bind(id),
    db.prepare('DELETE FROM sightings WHERE comparison_id = ?').bind(id),
    db.prepare('DELETE FROM comparisons WHERE id = ?').bind(id),
  ]);
  const row = found?.results[0];
  if (!row) return c.json(GONE, 404);
  const body: ComparisonsDiscarded = { comparisons: 1, matches: row.matches, blocked: null };
  return c.json(body, 200, NO_STORE);
});
