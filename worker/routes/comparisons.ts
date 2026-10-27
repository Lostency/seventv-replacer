import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { matchSets, pairingKey } from '../../shared/compare';
import { SEASONS } from '../../shared/seasons';
import { fetchEmoteSet, isEmoteId, SevenTvError, type EmoteSet } from '../../shared/seventv';
import type {
  ApiError,
  ComparisonPreview,
  ComparisonSubmitted,
  Cooldown,
  SetRef,
} from '../../shared/types';
import { requireUser, type AppEnv } from '../session';

/** The same normal + seasonal pair can be submitted again this long after its last submission. */
export const COOLDOWN_DAYS = 14;

const setId = z.string().refine(isEmoteId, 'Not a 7TV set ID');
const pairBody = z.object({ normalSetId: setId, seasonalSetId: setId });
const submitBody = pairBody.extend({
  season: z.enum(SEASONS),
  excluded: z.array(z.object({ originalId: z.string(), replacementId: z.string() })).max(5000),
});

function cooldownFrom(submittedAt: string): Cooldown {
  const availableFrom = new Date(new Date(submittedAt).getTime() + COOLDOWN_DAYS * 86_400_000);
  return { comparedOn: submittedAt, availableFrom: availableFrom.toISOString() };
}

const setRef = (set: EmoteSet): SetRef => ({ id: set.id, name: set.name, owner: set.owner?.name ?? null });

async function existing(c: Context<AppEnv>, normalSetId: string, seasonalSetId: string) {
  return c.env.DB.prepare(
    'SELECT id, submitted_at AS submittedAt FROM comparisons WHERE normal_set_id = ? AND seasonal_set_id = ?',
  )
    .bind(normalSetId, seasonalSetId)
    .first<{ id: string; submittedAt: string }>();
}

function activeCooldown(row: { submittedAt: string } | null): Cooldown | null {
  if (!row) return null;
  const cooldown = cooldownFrom(row.submittedAt);
  return new Date(cooldown.availableFrom).getTime() > Date.now() ? cooldown : null;
}

/** Both sets, fetched by the server itself: the browser only names them. */
async function loadPair(c: Context<AppEnv>, normalSetId: string, seasonalSetId: string) {
  if (normalSetId === seasonalSetId) {
    return { error: c.json<ApiError>({ error: 'Pick two different sets: one normal, one seasonal.' }, 400) };
  }
  try {
    const [normal, seasonal] = await Promise.all([fetchEmoteSet(normalSetId), fetchEmoteSet(seasonalSetId)]);
    return { normal, seasonal };
  } catch (error) {
    if (error instanceof SevenTvError) {
      return { error: c.json<ApiError>({ error: error.message }, error.kind === 'not-found' ? 404 : 502) };
    }
    throw error;
  }
}

export const comparisons = new Hono<AppEnv>();

comparisons.use('*', requireUser);

comparisons.post('/preview', async (c) => {
  const parsed = pairBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json<ApiError>({ error: 'Pick a normal set and a seasonal set first.' }, 400);
  const { normalSetId, seasonalSetId } = parsed.data;

  const pair = await loadPair(c, normalSetId, seasonalSetId);
  if (pair.error) return pair.error;

  const body: ComparisonPreview = {
    normal: setRef(pair.normal),
    seasonal: setRef(pair.seasonal),
    channel: pair.normal.owner?.name ?? null,
    matches: matchSets(pair.normal, pair.seasonal),
    cooldown: activeCooldown(await existing(c, normalSetId, seasonalSetId)),
  };
  return c.json(body);
});

comparisons.post('/', async (c) => {
  const parsed = submitBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json<ApiError>({ error: 'Pick both sets and a season, then try again.' }, 400);
  const { normalSetId, seasonalSetId, season, excluded } = parsed.data;

  const previous = await existing(c, normalSetId, seasonalSetId);
  const cooldown = activeCooldown(previous);
  if (cooldown) return c.json<ApiError>({ error: 'These two sets were compared recently.', cooldown }, 409);

  const pair = await loadPair(c, normalSetId, seasonalSetId);
  if (pair.error) return pair.error;
  const owner = pair.normal.owner;
  if (!owner) return c.json<ApiError>({ error: '7TV doesn’t say who owns the normal set, so it can’t be credited.' }, 422);

  const skip = new Set(excluded.map(pairingKey));
  const matches = matchSets(pair.normal, pair.seasonal).filter((m) => !skip.has(pairingKey(m)));
  if (matches.length === 0) return c.json<ApiError>({ error: 'Tick at least one match to submit.' }, 400);

  const user = c.get('user');
  const id = previous?.id ?? crypto.randomUUID();
  const submittedAt = new Date().toISOString();
  const db = c.env.DB;
  await db.batch([
    // A recomparison replaces this comparison's sightings; other comparisons keep theirs.
    db.prepare('DELETE FROM sightings WHERE comparison_id = ?').bind(id),
    db
      .prepare(
        `INSERT INTO comparisons (id, normal_set_id, seasonal_set_id, season, channel_id, channel_name, submitted_by, submitted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (normal_set_id, seasonal_set_id) DO UPDATE SET
           season = excluded.season, channel_id = excluded.channel_id, channel_name = excluded.channel_name,
           submitted_by = excluded.submitted_by, submitted_at = excluded.submitted_at`,
      )
      .bind(id, normalSetId, seasonalSetId, season, owner.id, owner.name, user.twitchId, submittedAt),
    // One statement for every sighting: D1 caps the queries a single request may run.
    db
      .prepare(
        `INSERT INTO sightings (comparison_id, season, original_id, replacement_id, alias, channel_id)
         SELECT ?1, ?2, value ->> '$.originalId', value ->> '$.replacementId', value ->> '$.alias', ?3
           FROM json_each(?4)`,
      )
      .bind(id, season, owner.id, JSON.stringify(matches)),
  ]);

  const body: ComparisonSubmitted = { channel: owner.name, sightings: matches.length, cooldown: cooldownFrom(submittedAt) };
  return c.json(body, 201);
});
