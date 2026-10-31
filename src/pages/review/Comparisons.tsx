import { ArrowRight } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { SEASONS, seasonLabel, type SeasonId } from '@shared/seasons';
import type { AdminComparison, AdminComparisonsResponse, BlockedSubmitter, SubmitterGroup } from '@shared/types';
import { discardComparison, discardSubmitter, fetchAdminComparisons, moveComparison, unblockSubmitter } from '../../api';
import { GunmetalKey } from '../../design/GunmetalKey';
import { Knob } from '../../design/Knob';
import workbench from '../Workbench.module.css';
import styles from './review.module.css';

interface ComparisonsProps {
  /** A write changed which sightings exist where: the page re-reads its review queue. */
  onChanged(): void;
  onProblem(message: string): void;
}

type Loaded<T> = T | 'loading' | 'failed';
type Update = (data: AdminComparisonsResponse) => AdminComparisonsResponse;

const SEASON_OPTIONS = SEASONS.map((s) => ({ value: s, label: seasonLabel(s) }));
const EXPANDED = 3;

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en')} ${n === 1 ? one : many}`;
const counts = (comparisons: number, matches: number) =>
  `${plural(comparisons, 'comparison', 'comparisons')} · ${plural(matches, 'match', 'matches')}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en', { dateStyle: 'medium' });
const sqlDay = (sqlTime: string) => day(`${sqlTime.replace(' ', 'T')}Z`);
const nameOf = (s: { twitchId: string; login: string | null; displayName: string | null }) =>
  s.displayName ?? s.login ?? `Twitch ID ${s.twitchId}`;
const setUrl = (id: string) => `https://7tv.app/emote-sets/${id}`;
const reasonOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

const replaced = (moved: AdminComparison): Update => (data) => ({
  ...data,
  submitters: data.submitters.map((s) => ({ ...s, comparisons: s.comparisons.map((c) => (c.id === moved.id ? moved : c)) })),
});

const withoutComparison = (gone: AdminComparison): Update => (data) => ({
  ...data,
  submitters: data.submitters
    .map((s) =>
      s.comparisons.some((c) => c.id === gone.id)
        ? { ...s, matches: s.matches - gone.matches, comparisons: s.comparisons.filter((c) => c.id !== gone.id) }
        : s,
    )
    .filter((s) => s.comparisons.length > 0),
});

const withoutSubmitter = (twitchId: string, blocked: BlockedSubmitter | null): Update => (data) => ({
  submitters: data.submitters.filter((s) => s.twitchId !== twitchId),
  blocked: blocked ? [blocked, ...data.blocked.filter((b) => b.twitchId !== twitchId)] : data.blocked,
});

const unblocked = (twitchId: string): Update => (data) => ({ ...data, blocked: data.blocked.filter((b) => b.twitchId !== twitchId) });

/** Every submitted comparison, by who sent it, with season moves, discards and blocks. */
export function Comparisons({ onChanged, onProblem }: ComparisonsProps) {
  const [data, setData] = useState<Loaded<AdminComparisonsResponse>>('loading');
  /** Bumped after a failed write, so the list is read again from the server. */
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    fetchAdminComparisons().then(
      (body) => current && setData(body),
      () => current && setData('failed'),
    );
    return () => {
      current = false;
    };
  }, [version]);

  /** Runs one write and applies what it did to the list; `changed` says whether the queue needs reading again. */
  const act = async (key: string, write: () => Promise<Update>, fallback: string, changed = true) => {
    setBusy(key);
    try {
      const update = await write();
      setData((d) => (typeof d === 'object' ? update(d) : d));
      if (changed) onChanged();
    } catch (error) {
      onProblem(reasonOf(error, fallback));
      setVersion((v) => v + 1);
    } finally {
      setBusy(null);
    }
  };

  if (data === 'loading') return <p className={workbench.stepLede}>Loading comparisons…</p>;
  if (data === 'failed') {
    return (
      <p className={workbench.plate} role="alert">
        Comparisons didn’t load. Reload the page to try again.
      </p>
    );
  }

  return (
    <>
      {data.submitters.length === 0 ? (
        <p className={workbench.stepLede}>No one has submitted a comparison yet.</p>
      ) : (
        <ul className={styles.submitters}>
          {data.submitters.map((s, index) => (
            <SubmitterCard
              key={s.twitchId}
              submitter={s}
              startOpen={index < EXPANDED}
              busy={busy}
              onMove={(c, season) =>
                void act(c.id, async () => replaced((await moveComparison(c.id, season)).comparison), 'The season didn’t change. Try again.')
              }
              onDiscard={(c) =>
                void act(
                  c.id,
                  async () => {
                    await discardComparison(c.id);
                    return withoutComparison(c);
                  },
                  'The comparison wasn’t discarded. Try again.',
                )
              }
              onDiscardAll={(block) =>
                void act(
                  s.twitchId,
                  async () => withoutSubmitter(s.twitchId, (await discardSubmitter(s.twitchId, block)).blocked),
                  'Nothing was discarded. Try again.',
                )
              }
            />
          ))}
        </ul>
      )}

      {data.blocked.length > 0 && (
        <div className={styles.blocked}>
          <h3 className={styles.blockedTitle}>Blocked</h3>
          <ul className={styles.blockedList} aria-label="Blocked">
            {data.blocked.map((b) => (
              <li key={b.twitchId} className={styles.blockedRow}>
                <span className={styles.line}>{nameOf(b)}</span>
                <span className={styles.brokenMeta}>blocked {sqlDay(b.blockedAt)}</span>
                <GunmetalKey
                  size="small"
                  busy={busy === b.twitchId}
                  label={`Unblock ${nameOf(b)}`}
                  onClick={() =>
                    void act(
                      b.twitchId,
                      async () => {
                        await unblockSubmitter(b.twitchId);
                        return unblocked(b.twitchId);
                      },
                      'They’re still blocked. Try again.',
                      false,
                    )
                  }
                >
                  Unblock
                </GunmetalKey>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

interface SubmitterCardProps {
  submitter: SubmitterGroup;
  startOpen: boolean;
  busy: string | null;
  onMove(c: AdminComparison, season: SeasonId): void;
  onDiscard(c: AdminComparison): void;
  onDiscardAll(block: boolean): void;
}

function SubmitterCard({ submitter: s, startOpen, busy, onMove, onDiscard, onDiscardAll }: SubmitterCardProps) {
  const headingId = useId();
  const [open, setOpen] = useState(startOpen);
  /** Which discard waits for confirmation: a comparison's id, or the whole card with or without a block. */
  const [confirming, setConfirming] = useState<string | 'all' | 'block' | null>(null);
  const name = nameOf(s);
  const total = s.comparisons.length;

  return (
    <li>
      <section className={styles.card} aria-labelledby={headingId}>
        <div>
          <h3 id={headingId} className={styles.submitterName}>
            {name}
          </h3>
          <p className={styles.brokenMeta}>{counts(total, s.matches)}</p>
        </div>

        {confirming === 'all' || confirming === 'block' ? (
          <Confirm
            question={`Discard ${plural(total, 'comparison', 'comparisons')} and ${plural(s.matches, 'match', 'matches')}${
              confirming === 'block' ? `, and block ${name}` : ''
            }?`}
            action={confirming === 'block' ? 'Discard and block' : 'Discard'}
            busy={busy === s.twitchId}
            onConfirm={() => onDiscardAll(confirming === 'block')}
            onCancel={() => setConfirming(null)}
          />
        ) : (
          <div className={styles.actions}>
            <GunmetalKey size="small" onClick={() => setConfirming('all')}>
              Discard all
            </GunmetalKey>
            {!s.admin && (
              <GunmetalKey size="small" onClick={() => setConfirming('block')}>
                Discard all &amp; block
              </GunmetalKey>
            )}
          </div>
        )}

        {open ? (
          <ul className={styles.comparisonList}>
            {s.comparisons.map((c) => (
              <li key={c.id} className={styles.comparisonRow}>
                <div className={styles.comparisonInfo}>
                  <p className={styles.line}>{c.channelName}</p>
                  <p className={styles.comparisonSets}>
                    <a href={setUrl(c.normalSetId)} target="_blank" rel="noreferrer">
                      {c.normalSetName ?? c.normalSetId}
                    </a>
                    <ArrowRight className={styles.arrow} size={14} strokeWidth={2.5} aria-label="to" />
                    <a href={setUrl(c.seasonalSetId)} target="_blank" rel="noreferrer">
                      {c.seasonalSetName ?? c.seasonalSetId}
                    </a>
                  </p>
                  <p className={styles.brokenMeta}>
                    {plural(c.matches, 'match', 'matches')} · {day(c.submittedAt)}
                  </p>
                </div>
                <div className={styles.rowKnob}>
                  <Knob<SeasonId>
                    label={`Season for ${c.channelName}`}
                    options={SEASON_OPTIONS}
                    value={c.season}
                    onChange={(season) => onMove(c, season)}
                  />
                </div>
                {confirming === c.id ? (
                  <Confirm
                    question={`Discard 1 comparison and ${plural(c.matches, 'match', 'matches')}?`}
                    action="Discard"
                    busy={busy === c.id}
                    onConfirm={() => onDiscard(c)}
                    onCancel={() => setConfirming(null)}
                  />
                ) : (
                  <div className={styles.actions}>
                    <GunmetalKey size="small" busy={busy === c.id} label={`Discard ${c.channelName}`} onClick={() => setConfirming(c.id)}>
                      Discard
                    </GunmetalKey>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <button type="button" className={workbench.textButton} onClick={() => setOpen(true)}>
            Show {plural(total, 'comparison', 'comparisons')}
          </button>
        )}
      </section>
    </li>
  );
}

interface ConfirmProps {
  question: string;
  action: string;
  busy: boolean;
  onConfirm(): void;
  onCancel(): void;
}

function Confirm({ question, action, busy, onConfirm, onCancel }: ConfirmProps) {
  return (
    <div className={styles.confirm}>
      <p className={styles.line}>{question}</p>
      <div className={styles.actions}>
        <GunmetalKey size="small" busy={busy} onClick={onConfirm}>
          {action}
        </GunmetalKey>
        <button type="button" className={workbench.textButton} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
