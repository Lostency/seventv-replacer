import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { currentSeason, SEASONS, seasonLabel, type SeasonId } from '@shared/seasons';
import type { AdminMapping, BrokenEmote, Candidate, MappingWritten, MeResponse, ReviewResponse } from '@shared/types';
import {
  decide as sendDecision,
  deleteMapping,
  fetchMe,
  fetchReview,
  rejectPairing,
  restoreBroken,
  saveThreshold,
  signInUrl,
  unrejectPairing,
  writeMapping,
} from '../api';
import { AmberScreen } from '../design/AmberScreen';
import { DeckField } from '../design/DeckField';
import { GunmetalKey } from '../design/GunmetalKey';
import { Knob } from '../design/Knob';
import { SiteFooter } from '../design/SiteFooter';
import { SiteHeader } from '../design/SiteHeader';
import { UndoToast } from '../design/UndoToast';
import { AddMapping } from './review/AddMapping';
import { BrokenEmotes } from './review/BrokenEmotes';
import { ChoiceCard } from './review/ChoiceCard';
import { Mappings } from './review/Mappings';
import { ReviewCard } from './review/ReviewCard';
import styles from './Workbench.module.css';
import review from './review/review.module.css';

const SEASON_OPTIONS = SEASONS.map((s) => ({ value: s, label: seasonLabel(s) }));

type Loaded<T> = T | 'loading' | 'failed';

/** The last decision, and how to take it back. */
interface Toast {
  message: string;
  undo(): Promise<unknown>;
}

const reasonOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);
const keyOf = (c: Candidate) => `${c.originalId}>${c.replacementId}`;

/** The queue by emote, in queue order: each original with every option waiting for it. */
function byOriginal(candidates: Candidate[]): Candidate[][] {
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) groups.set(c.originalId, [...(groups.get(c.originalId) ?? []), c]);
  return [...groups.values()];
}

export function Review() {
  const [me, setMe] = useState<Loaded<MeResponse>>('loading');
  const [season, setSeason] = useState<SeasonId>(() => currentSeason(new Date()));
  const [queue, setQueue] = useState<Loaded<ReviewResponse>>('loading');
  /** Bumped after every write, so everything on the page reads the preset afresh. */
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [problem, setProblem] = useState<string>();
  const [threshold, setThresholdText] = useState('');
  const [thresholdError, setThresholdError] = useState<string>();
  const [thresholdSaved, setThresholdSaved] = useState<string>();
  const thresholdFilled = useRef(false);

  const user = typeof me === 'object' ? me.user : null;
  const isAdmin = Boolean(user?.admin);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const dismiss = useCallback(() => setToast(null), []);

  useEffect(() => {
    const controller = new AbortController();
    fetchMe(controller.signal).then(setMe, () => {
      if (!controller.signal.aborted) setMe('failed');
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let current = true;
    fetchReview(season).then(
      (body) => {
        if (!current) return;
        setQueue(body);
        // Only the first answer fills the field: later ones must not overwrite what the admin is typing.
        if (!thresholdFilled.current) setThresholdText(String(body.threshold));
        thresholdFilled.current = true;
      },
      (error: unknown) => {
        if (!current) return;
        setQueue('failed');
        setProblem(reasonOf(error, 'The review queue didn’t load. Reload the page to try again.'));
      },
    );
    return () => {
      current = false;
    };
  }, [isAdmin, season, version]);

  /** Runs one write; on success shows its toast and re-reads the queue. */
  const decide = async (key: string, write: () => Promise<Toast>) => {
    setBusy(key);
    setProblem(undefined);
    try {
      setToast(await write());
    } catch (error) {
      setProblem(reasonOf(error, 'That didn’t save. Try again.'));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const accept = (c: Candidate) =>
    decide(keyOf(c), async () => {
      const { previous } = await writeMapping({ season, originalId: c.originalId, replacementId: c.replacementId, source: 'review' });
      return {
        message: `Accepted ${c.alias}.`,
        undo: () => (previous ? writeMapping({ season, ...previous }) : deleteMapping(season, c.originalId)),
      };
    });

  const reject = (c: Candidate) =>
    decide(keyOf(c), async () => {
      const pairing = { season, originalId: c.originalId, replacementId: c.replacementId };
      await rejectPairing(pairing);
      return { message: `Rejected ${c.alias}.`, undo: () => unrejectPairing(pairing) };
    });

  /** Keeps one option for an emote and rejects the others, the replaced mapping included. */
  const keep = (options: Candidate[], replacementId: string | null) => {
    const { originalId, alias, current } = options[0]!;
    const rejectIds = options.map((o) => o.replacementId).filter((id) => id !== replacementId);
    if (replacementId && current) rejectIds.push(current);
    return decide(originalId, async () => {
      const { previous } = await sendDecision({ season, originalId, replacementId, rejectIds });
      const unreject = () =>
        Promise.all(rejectIds.map((id) => unrejectPairing({ season, originalId, replacementId: id })));
      const unmap = () => (previous ? writeMapping({ season, ...previous }) : deleteMapping(season, originalId));
      return {
        message: replacementId
          ? `Kept a new ${alias}.`
          : current
            ? `Kept the current ${alias}.`
            : `Rejected every ${alias} option.`,
        undo: () => Promise.all([unreject(), replacementId ? unmap() : null]),
      };
    });
  };

  const added = (originalId: string, { previous }: MappingWritten) => {
    setProblem(undefined);
    setToast({
      message: previous ? 'Replaced the mapping.' : 'Added the mapping.',
      undo: () => (previous ? writeMapping({ season, ...previous }) : deleteMapping(season, originalId)),
    });
    refresh();
  };

  const dismissed = (row: BrokenEmote) => {
    setProblem(undefined);
    setToast({ message: 'Dismissed the report.', undo: () => restoreBroken(season, row) });
    refresh();
  };

  const deleted = (row: AdminMapping | null) => {
    setProblem(undefined);
    if (row) setToast({ message: 'Deleted the mapping.', undo: () => writeMapping({ season, ...row }) });
    refresh();
  };

  const undo = async () => {
    if (!toast) return;
    setToast(null);
    try {
      await toast.undo();
    } catch (error) {
      setProblem(reasonOf(error, 'Undo didn’t go through. Try again.'));
    } finally {
      refresh();
    }
  };

  const submitThreshold = async (event: FormEvent) => {
    event.preventDefault();
    setThresholdSaved(undefined);
    const value = Number(threshold.trim());
    if (!/^\d+$/.test(threshold.trim()) || value < 1 || value > 50) {
      setThresholdError('Use a whole number from 1 to 50.');
      return;
    }
    try {
      const saved = await saveThreshold(value);
      setThresholdSaved(`Saved. Pairings need ${saved.threshold} ${saved.threshold === 1 ? 'channel' : 'channels'}.`);
      refresh();
    } catch (error) {
      setThresholdError(reasonOf(error, 'The threshold didn’t save. Try again.'));
    }
  };

  const ready = typeof queue === 'object' ? queue : null;

  return (
    <>
      <SiteHeader />
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.heading}>Review</h1>
          <p className={styles.lede}>
            Swaps that enough different channels made by hand wait here. Accepting one adds it to the season’s preset;
            rejecting it keeps it out for good.
          </p>
        </div>

        {me === 'loading' && <p className={styles.stepLede}>Checking whether you’re signed in…</p>}
        {me === 'failed' && (
          <p className={styles.plate} role="alert">
            <strong>The server didn’t answer.</strong> Reload the page to try again.
          </p>
        )}

        {typeof me === 'object' && !user && (
          <section className={styles.step} aria-labelledby="signin-heading">
            <h2 id="signin-heading" className={styles.sectionHeading}>
              Sign in with Twitch
            </h2>
            {me.signInAvailable ? (
              <div>
                <GunmetalKey href={signInUrl('/review')}>Sign in with Twitch</GunmetalKey>
              </div>
            ) : (
              <p className={styles.plate}>
                <strong>Twitch sign-in isn’t set up on this server yet.</strong> Review opens once it is.
              </p>
            )}
          </section>
        )}

        {user && !isAdmin && (
          <p className={styles.plate}>
            <strong>Review is for admins.</strong> You’re signed in as {user.displayName}.
          </p>
        )}

        {isAdmin && (
          <>
            <section className={styles.step} aria-labelledby="season-heading">
              <h2 id="season-heading" className={styles.sectionHeading}>
                Season
              </h2>
              <div className={styles.console}>
                <div className={styles.knob}>
                  <Knob<SeasonId> label="Season" options={SEASON_OPTIONS} value={season} onChange={setSeason} />
                </div>
                <form className={review.threshold} onSubmit={(e) => void submitThreshold(e)} noValidate>
                  <DeckField
                    label="Channels needed"
                    value={threshold}
                    onChange={(value) => {
                      setThresholdText(value);
                      setThresholdError(undefined);
                      setThresholdSaved(undefined);
                    }}
                    error={thresholdError}
                    hint={thresholdSaved ?? 'Different channels that must make a swap before it shows up here.'}
                  />
                  <GunmetalKey type="submit">Save</GunmetalKey>
                </form>
              </div>
            </section>

            <section className={styles.step} aria-labelledby="queue-heading">
              <h2 id="queue-heading" className={styles.sectionHeading}>
                Waiting for review
              </h2>
              <AmberScreen busy={queue === 'loading'}>
                {ready ? `${seasonLabel(season)} · ${ready.candidates.length} waiting` : 'Loading'}
              </AmberScreen>
              {problem && (
                <p className={styles.plate} role="alert">
                  {problem}
                </p>
              )}
              {ready && ready.candidates.length === 0 && (
                <p className={styles.stepLede}>Nothing is waiting for review in {seasonLabel(season)}.</p>
              )}
              {ready && ready.candidates.length > 0 && (
                <ul className={review.queue} aria-label="Waiting for review">
                  {byOriginal(ready.candidates).map((options) => {
                    const [c] = options as [Candidate];
                    return options.length === 1 && !c.current ? (
                      <ReviewCard
                        key={keyOf(c)}
                        candidate={c}
                        busy={busy === keyOf(c)}
                        onAccept={() => void accept(c)}
                        onReject={() => void reject(c)}
                      />
                    ) : (
                      <ChoiceCard
                        key={c.originalId}
                        options={options}
                        busy={busy === c.originalId}
                        onKeep={(replacementId) => void keep(options, replacementId)}
                      />
                    );
                  })}
                </ul>
              )}
            </section>

            <section className={styles.step} aria-labelledby="broken-heading">
              <h2 id="broken-heading" className={styles.sectionHeading}>
                Broken emotes
              </h2>
              <p className={styles.stepLede}>
                Mappings whose emote Replace runs found deleted or unusable on 7TV. Runs used the normal emote instead.
                Replace or delete the mapping, or dismiss the report if 7TV has it working again.
              </p>
              <BrokenEmotes
                season={season}
                version={version}
                onReplaced={added}
                onDeleted={deleted}
                onDismissed={dismissed}
                onProblem={setProblem}
              />
            </section>

            <section className={styles.step} aria-labelledby="add-heading">
              <h2 id="add-heading" className={styles.sectionHeading}>
                Add a mapping
              </h2>
              <p className={styles.stepLede}>
                Paste the 7TV links of a normal emote and its {seasonLabel(season)} version. An emote that already
                has a mapping gets the new one instead.
              </p>
              <AddMapping season={season} onAdded={added} onProblem={setProblem} />
            </section>

            <section className={styles.step} aria-label="Preset">
              <Mappings season={season} version={version} onDeleted={deleted} onProblem={setProblem} />
            </section>
          </>
        )}
      </main>
      {toast && <UndoToast message={toast.message} onUndo={() => void undo()} onDone={dismiss} />}
      <SiteFooter />
    </>
  );
}
