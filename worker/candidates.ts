import type { SeasonId } from '../shared/seasons';
import type { Candidate } from '../shared/types';

/** Distinct channels a pairing needs before it goes up for review, until an admin changes it. */
export const DEFAULT_THRESHOLD = 2;
const THRESHOLD_KEY = 'review_threshold';

export async function getThreshold(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(THRESHOLD_KEY).first<{ value: string }>();
  const value = Number(row?.value);
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_THRESHOLD;
}

export async function setThreshold(db: D1Database, value: number): Promise<void> {
  await db
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .bind(THRESHOLD_KEY, String(value))
    .run();
}

/**
 * Pairings shown by at least `threshold` distinct channels, minus those already
 * in the season's preset and those rejected. A channel counts once per pairing.
 */
export async function listCandidates(db: D1Database, season: SeasonId, threshold: number): Promise<Candidate[]> {
  const { results } = await db
    .prepare(
      `SELECT s.original_id AS originalId, s.replacement_id AS replacementId, MIN(s.alias) AS alias,
              COUNT(DISTINCT s.channel_id) AS channels, m.replacement_id AS current
         FROM sightings s
         LEFT JOIN mappings m ON m.season = s.season AND m.original_id = s.original_id
        WHERE s.season = ?1
          AND (m.replacement_id IS NULL OR m.replacement_id <> s.replacement_id)
          AND NOT EXISTS (
            SELECT 1 FROM rejections r
             WHERE r.season = s.season AND r.original_id = s.original_id AND r.replacement_id = s.replacement_id)
        GROUP BY s.original_id, s.replacement_id
       HAVING channels >= ?2
        ORDER BY channels DESC, alias COLLATE NOCASE`,
    )
    .bind(season, threshold)
    .all<Candidate>();
  return results;
}
