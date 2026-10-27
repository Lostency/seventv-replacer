import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { pairingKey } from '@shared/compare';
import { currentSeason, SEASONS, seasonLabel, type SeasonId } from '@shared/seasons';
import type { EmoteSet } from '@shared/seventv';
import type { ComparisonPreview, ComparisonSubmitted, Cooldown, MeResponse } from '@shared/types';
import { ApiRequestError, fetchMe, previewComparison, signInUrl, signOut, submitComparison } from '../api';
import { SetPicker } from '../components/SetPicker';
import { ActionKey } from '../design/ActionKey';
import { AmberScreen } from '../design/AmberScreen';
import { GunmetalKey } from '../design/GunmetalKey';
import { Knob } from '../design/Knob';
import { SiteFooter } from '../design/SiteFooter';
import { SiteHeader } from '../design/SiteHeader';
import { SwapList } from '../design/SwapList';
import styles from './Workbench.module.css';

const SEASON_OPTIONS = SEASONS.map((s) => ({ value: s, label: seasonLabel(s) }));

const SIGN_IN_PROBLEMS: Record<string, string> = {
  cancelled: 'Sign-in was cancelled on Twitch. Try again whenever you like.',
  expired: 'That sign-in took too long or was opened twice. Try again.',
  failed: 'Twitch didn’t confirm the sign-in. Try again in a minute.',
};

type Loaded<T> = T | 'loading' | 'failed';

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; result: ComparisonSubmitted }
  | { kind: 'failed'; message: string };

const day = (iso: string) => new Date(iso).toLocaleDateString('en', { dateStyle: 'medium' });
const cooldownText = (c: Cooldown) => `Compared on ${day(c.comparedOn)}, can be compared again from ${day(c.availableFrom)}.`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function Compare() {
  const [params] = useSearchParams();
  const signInProblem = SIGN_IN_PROBLEMS[params.get('signin') ?? ''];
  const [me, setMe] = useState<Loaded<MeResponse>>('loading');

  const [normal, setNormal] = useState<EmoteSet | null>(null);
  const [seasonal, setSeasonal] = useState<EmoteSet | null>(null);
  const [season, setSeason] = useState<SeasonId>(() => currentSeason(new Date()));
  const [preview, setPreview] = useState<Loaded<ComparisonPreview> | null>(null);
  const [previewError, setPreviewError] = useState<string>();
  const [unticked, setUnticked] = useState<Set<string>>(() => new Set());
  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });

  useEffect(() => {
    const controller = new AbortController();
    fetchMe(controller.signal).then(setMe, () => {
      if (!controller.signal.aborted) setMe('failed');
    });
    return () => controller.abort();
  }, []);

  // Both sides picked: the server fetches the two sets itself and matches them.
  useEffect(() => {
    setUnticked(new Set());
    setSubmit({ kind: 'idle' });
    setPreviewError(undefined);
    if (!normal || !seasonal) {
      setPreview(null);
      return;
    }
    let current = true;
    setPreview('loading');
    previewComparison({ normalSetId: normal.id, seasonalSetId: seasonal.id }).then(
      (body) => current && setPreview(body),
      (error: unknown) => {
        if (!current) return;
        setPreview('failed');
        setPreviewError(error instanceof Error ? error.message : 'The sets couldn’t be compared. Try again.');
      },
    );
    return () => {
      current = false;
    };
  }, [normal, seasonal]);

  const user = typeof me === 'object' ? me.user : null;
  const ready = typeof preview === 'object' && preview !== null ? preview : null;
  const cooldown = submit.kind === 'done' ? submit.result.cooldown : ready?.cooldown;
  const tickedCount = ready ? ready.matches.filter((m) => !unticked.has(pairingKey(m))).length : 0;

  const readout = (() => {
    if (submit.kind === 'sending') return 'Sending';
    if (submit.kind === 'done') return `Recorded · ${submit.result.sightings}`;
    if (!normal || !seasonal) return 'Pick both sets';
    if (preview === 'loading') return 'Matching';
    if (!ready) return 'No match yet';
    if (ready.cooldown) return 'Compared recently';
    return `${seasonLabel(season)} · ${plural(tickedCount, 'match', 'matches')}`;
  })();

  const send = async () => {
    if (!normal || !seasonal || !ready || submit.kind === 'sending') {
      if (!normal || !seasonal) setSubmit({ kind: 'failed', message: 'Pick a normal set and a seasonal set first.' });
      return;
    }
    if (ready.cooldown) {
      setSubmit({ kind: 'failed', message: cooldownText(ready.cooldown) });
      return;
    }
    if (tickedCount === 0) {
      setSubmit({ kind: 'failed', message: 'Tick at least one match to submit.' });
      return;
    }
    setSubmit({ kind: 'sending' });
    try {
      const result = await submitComparison({
        normalSetId: normal.id,
        seasonalSetId: seasonal.id,
        season,
        excluded: ready.matches.filter((m) => unticked.has(pairingKey(m))).map(({ originalId, replacementId }) => ({ originalId, replacementId })),
      });
      setSubmit({ kind: 'done', result });
    } catch (error) {
      const message =
        error instanceof ApiRequestError && error.cooldown
          ? cooldownText(error.cooldown)
          : error instanceof Error
            ? error.message
            : 'The comparison couldn’t be sent. Try again.';
      setSubmit({ kind: 'failed', message });
    }
  };

  const leave = async () => {
    await signOut().catch(() => {});
    setMe((m) => (typeof m === 'object' ? { ...m, user: null } : m));
  };

  return (
    <>
      <SiteHeader />
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.heading}>Compare two sets</h1>
          <p className={styles.lede}>
            Pick a channel’s normal set and its seasonal set. Every emote that kept its name but changed is a swap the
            channel made by hand. When two different channels made the same swap, it goes up for review.
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
            <p className={styles.stepLede}>
              Compare needs a Twitch sign-in, so every contribution is tied to a real account. Replace doesn’t: you can
              make your own set seasonal without signing in.
            </p>
            {signInProblem && (
              <p className={styles.plate} role="alert">
                {signInProblem}
              </p>
            )}
            {me.signInAvailable ? (
              <div>
                <GunmetalKey href={signInUrl('/compare')}>Sign in with Twitch</GunmetalKey>
              </div>
            ) : (
              <p className={styles.plate}>
                <strong>Twitch sign-in isn’t set up on this server yet.</strong> Compare opens once it is.
              </p>
            )}
          </section>
        )}

        {user && (
          <>
            <p className={styles.signedIn}>
              Signed in as {user.displayName}
              <GunmetalKey size="small" onClick={() => void leave()}>
                Sign out
              </GunmetalKey>
            </p>

            <section className={styles.step} aria-labelledby="normal-heading">
              <h2 id="normal-heading" className={styles.stepHeading}>
                <span className={styles.stepNumber} aria-hidden="true">
                  1
                </span>
                The normal set
              </h2>
              <p className={styles.stepLede}>
                The set the channel uses most of the year. The comparison counts for whoever owns this set on 7TV.
              </p>
              <SetPicker label="Channel name or 7TV set link" selected={normal} onSelect={setNormal} />
            </section>

            <section className={styles.step} aria-labelledby="seasonal-heading">
              <h2 id="seasonal-heading" className={styles.stepHeading}>
                <span className={styles.stepNumber} aria-hidden="true">
                  2
                </span>
                The seasonal set
              </h2>
              <p className={styles.stepLede}>The same channel’s seasonal version. It can belong to another account.</p>
              <SetPicker label="Channel name or 7TV set link" selected={seasonal} onSelect={setSeasonal} />
            </section>

            <section className={styles.step} aria-labelledby="season-heading">
              <h2 id="season-heading" className={styles.stepHeading}>
                <span className={styles.stepNumber} aria-hidden="true">
                  3
                </span>
                Which season is it?
              </h2>
              <div className={styles.console}>
                <div className={styles.knob}>
                  <Knob<SeasonId> label="Season" options={SEASON_OPTIONS} value={season} onChange={setSeason} />
                </div>
                <p className={styles.consoleNote}>
                  <strong>{seasonLabel(season)}.</strong> The swaps are filed under this season. Winter covers
                  Christmas too.
                </p>
              </div>
            </section>

            <section className={styles.step} aria-labelledby="matches-heading">
              <h2 id="matches-heading" className={styles.stepHeading}>
                <span className={styles.stepNumber} aria-hidden="true">
                  4
                </span>
                Check the matches
              </h2>
              {!ready && preview !== 'loading' && !previewError && (
                <p className={styles.stepLede}>Pick both sets to see the emotes that kept their name but changed.</p>
              )}
              {preview === 'loading' && <p className={styles.stepLede}>Matching the two sets…</p>}
              {previewError && (
                <p className={styles.plate} role="alert">
                  {previewError}
                </p>
              )}
              {cooldown && (
                <p className={styles.plate}>
                  <strong>{cooldownText(cooldown)}</strong> Other set pairs from this channel can be compared any time.
                </p>
              )}
              {ready && (
                <>
                  <p className={styles.stepLede}>
                    {ready.matches.length
                      ? `${plural(ready.matches.length, 'emote', 'emotes')} kept the same name but changed${
                          ready.channel ? `, counted for ${ready.channel}` : ''
                        }. Untick any that aren’t real seasonal swaps.`
                      : 'No emote kept its name and changed between these sets, so there’s nothing to learn from them.'}
                  </p>
                  {ready.matches.length > 0 && (
                    <SwapList
                      label="Matches"
                      items={ready.matches.map((m) => ({
                        key: pairingKey(m),
                        alias: m.alias,
                        fromId: m.originalId,
                        toId: m.replacementId,
                      }))}
                      unticked={unticked}
                      onChange={setUnticked}
                    />
                  )}
                </>
              )}
            </section>

            <section className={styles.runBar} aria-label="Submit">
              <AmberScreen busy={submit.kind === 'sending'}>{readout}</AmberScreen>
              <ActionKey className={styles.runKey} onClick={() => void send()} busy={submit.kind === 'sending'}>
                Submit
              </ActionKey>
            </section>

            {submit.kind === 'failed' && (
              <p className={styles.plate} role="alert">
                {submit.message}
              </p>
            )}
            {submit.kind === 'done' && (
              <p className={styles.plate} role="status">
                <strong>
                  Thanks! {plural(submit.result.sightings, 'swap', 'swaps')} recorded for {submit.result.channel}.
                </strong>{' '}
                Once another channel has made the same swap, it goes up for review.
              </p>
            )}
          </>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
