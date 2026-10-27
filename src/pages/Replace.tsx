import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useSearchParams } from 'react-router';
import { currentSeason, isSeasonId, SEASONS, seasonLabel, type SeasonId } from '@shared/seasons';
import { fetchEmoteSet, seventvSetUrl, type EmoteSet } from '@shared/seventv';
import type { MappingRow } from '@shared/types';
import { fetchPreset } from '../api';
import { SetPicker } from '../components/SetPicker';
import { ActionKey } from '../design/ActionKey';
import { AmberScreen } from '../design/AmberScreen';
import { DeckField } from '../design/DeckField';
import { GunmetalKey } from '../design/GunmetalKey';
import { Knob } from '../design/Knob';
import { SiteFooter } from '../design/SiteFooter';
import { SiteHeader } from '../design/SiteHeader';
import { SwapList } from '../design/SwapList';
import { executeRun, planSwaps, type RunMode, type RunRecord, type RunReport } from '../lib/run';
import { createWriter } from '../lib/seventv-write';
import { cleanToken, forgetRun, loadRuns, loadToken, rememberRun, saveToken } from '../lib/storage';
import { undoRun, type UndoReport } from '../lib/undo';
import styles from './Workbench.module.css';

const SEASON_OPTIONS = SEASONS.map((s) => ({ value: s, label: seasonLabel(s) }));

const MODE_OPTIONS: { value: RunMode; label: string }[] = [
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'in-place', label: 'In place' },
  { value: 'revert', label: 'Revert' },
];

const MODE_NAMES: Record<RunMode, string> = {
  duplicate: 'Duplicate + replace',
  'in-place': 'Replace in place',
  revert: 'Revert',
};

type Loaded<T> = T | 'loading' | 'failed';

type RunState =
  | { kind: 'idle' }
  | { kind: 'running'; done: number; total: number }
  | { kind: 'done'; report: RunReport }
  | { kind: 'failed'; message: string };

type UndoResult = { record: RunRecord; report?: UndoReport; error?: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.');
const when = (iso: string) => new Date(iso).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });

function modeDescription(mode: RunMode, season: string): string {
  if (mode === 'duplicate') return `Copies your set into a new one with the ${season} emotes in. Your set stays as it is.`;
  if (mode === 'in-place') return `Swaps the emotes in this set for their ${season} versions, directly.`;
  return `Swaps ${season} emotes in this set back to their normal versions, using the ${season} preset in reverse.`;
}

export function Replace() {
  const [params] = useSearchParams();
  const channel = params.get('channel') ?? '';
  const seasonParam = params.get('season');

  const [token, setToken] = useState(loadToken);
  const [tokenError, setTokenError] = useState<string>();
  const tokenInput = useRef<HTMLInputElement>(null);

  const [set, setSet] = useState<EmoteSet | null>(null);
  const [setError, setSetError] = useState<string>();
  const setInput = useRef<HTMLInputElement>(null);

  const [season, setSeason] = useState<SeasonId>(() => (isSeasonId(seasonParam) ? seasonParam : currentSeason(new Date())));
  const [mode, setMode] = useState<RunMode>('duplicate');
  const [presets, setPresets] = useState<Partial<Record<SeasonId, Loaded<MappingRow[]>>>>({});
  const [unticked, setUnticked] = useState<Set<string>>(() => new Set());

  const [targetKind, setTargetKind] = useState<'new' | 'existing'>('new');
  const [newName, setNewName] = useState<string>();
  const [existingTarget, setExistingTarget] = useState<EmoteSet | null>(null);
  const [targetError, setTargetError] = useState<string>();

  const [runState, setRunState] = useState<RunState>({ kind: 'idle' });
  const [runs, setRuns] = useState<RunRecord[]>(loadRuns);
  const [undoing, setUndoing] = useState<string>();
  const [undoResult, setUndoResult] = useState<UndoResult>();

  const label = seasonLabel(season);
  const running = runState.kind === 'running';
  const preset = presets[season];

  useEffect(() => {
    if (preset !== undefined) return;
    setPresets((p) => ({ ...p, [season]: 'loading' }));
    fetchPreset(season).then(
      (body) => setPresets((p) => ({ ...p, [season]: body.mappings })),
      () => setPresets((p) => ({ ...p, [season]: 'failed' })),
    );
  }, [season, preset]);

  // A new set, season or mode is a new preview: everything starts ticked again.
  useEffect(() => setUnticked(new Set()), [set?.id, season, mode]);

  // Closing the tab mid-run would leave a half-swapped set without an Undo record.
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  const plan = useMemo(
    () => (set && Array.isArray(preset) ? planSwaps(set, preset, mode) : null),
    [set, preset, mode],
  );
  const ticked = plan ? plan.swaps.filter((s) => !unticked.has(s.fromId)) : [];
  const copyName = newName ?? (set ? `${set.name} (${label})` : '');

  const readout = (() => {
    if (runState.kind === 'running') {
      return `${mode === 'duplicate' ? 'Copying' : 'Swapping'} · ${runState.done}/${runState.total}`;
    }
    if (runState.kind === 'done') return `Done · ${runState.report.swapped} swapped`;
    if (!set) return 'Pick a set';
    if (preset === 'failed') return 'Preset unavailable';
    if (!plan) return `Loading ${label}`;
    return `${mode === 'revert' ? 'Revert' : label} · ${plural(ticked.length, 'swap', 'swaps')}`;
  })();

  const onToken = (value: string) => {
    const clean = cleanToken(value);
    setToken(clean);
    saveToken(clean);
    setTokenError(undefined);
  };

  const needToken = () => {
    flushSync(() => setTokenError('Paste your 7TV token first.'));
    tokenInput.current?.focus();
  };

  const run = async () => {
    if (!token) return needToken();
    if (!set) {
      flushSync(() => setSetError('Pick a set first.'));
      setInput.current?.focus();
      return;
    }
    if (!plan) return;
    if (mode !== 'duplicate' && ticked.length === 0) {
      setRunState({ kind: 'failed', message: 'Tick at least one emote to swap.' });
      return;
    }
    if (mode === 'duplicate' && targetKind === 'existing' && !existingTarget) {
      setTargetError('Pick the set to fill, or switch back to a new set.');
      return;
    }
    if (mode === 'duplicate' && targetKind === 'new' && !copyName.trim()) {
      setTargetError('Give the new set a name.');
      return;
    }

    const source = set;
    setUndoResult(undefined);
    setRunState({ kind: 'running', done: 0, total: mode === 'duplicate' ? source.emotes.length : ticked.length });
    try {
      const report = await executeRun(
        {
          mode,
          season,
          source,
          swaps: ticked,
          target:
            mode !== 'duplicate'
              ? undefined
              : targetKind === 'existing' && existingTarget
                ? { kind: 'existing', set: existingTarget }
                : { kind: 'new', name: copyName.trim() },
        },
        createWriter(token),
        { onProgress: (done, total) => setRunState({ kind: 'running', done, total }) },
      );
      const { record } = report;
      if (record.createdSet || record.swaps.length || record.added.length) setRuns(rememberRun(record));
      setRunState({ kind: 'done', report });
      // The set itself changed: show what it holds now.
      if (mode !== 'duplicate') fetchEmoteSet(source.id).then(setSet, () => {});
    } catch (error) {
      setRunState({ kind: 'failed', message: errorText(error) });
    }
  };

  const undo = async (record: RunRecord) => {
    if (!token) return needToken();
    if (running || undoing) return;
    setUndoing(record.id);
    setUndoResult(undefined);
    try {
      const report = await undoRun(record, createWriter(token));
      // Keep a record whose undo partly failed: running it again skips what is already back.
      setRuns(report.failed.length ? loadRuns() : forgetRun(record.id));
      setUndoResult({ record, report });
      if (set?.id === record.setId) fetchEmoteSet(set.id).then(setSet, () => {});
    } catch (error) {
      setUndoResult({ record, error: errorText(error) });
    } finally {
      setUndoing(undefined);
    }
  };

  return (
    <>
      <SiteHeader />
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.heading}>Make your set seasonal</h1>
          <p className={styles.lede}>
            Pick a set, turn the knobs, check the swaps, press the orange key. Nothing changes on 7TV until you do.
          </p>
        </div>

        <section className={styles.step} aria-labelledby="token-heading">
          <h2 id="token-heading" className={styles.stepHeading}>
            <span className={styles.stepNumber} aria-hidden="true">
              1
            </span>
            Your 7TV token
          </h2>
          <p className={styles.stepLede}>
            Replace changes your set with your own 7TV token. Not sure where it is?{' '}
            <Link to="/guide/token">The token guide</Link> shows you in about a minute.
          </p>
          <div className={styles.tokenRow}>
            <DeckField
              label="7TV token"
              type="password"
              placeholder="paste it here"
              value={token}
              onChange={onToken}
              error={tokenError}
              hint="Kept in this browser and only ever sent to 7TV."
              inputRef={tokenInput}
            />
            {token && (
              <GunmetalKey size="small" className={styles.tokenForget} onClick={() => onToken('')}>
                Forget token
              </GunmetalKey>
            )}
          </div>
        </section>

        <section className={styles.step} aria-labelledby="set-heading">
          <h2 id="set-heading" className={styles.stepHeading}>
            <span className={styles.stepNumber} aria-hidden="true">
              2
            </span>
            The set to change
          </h2>
          <SetPicker
            label="Channel name or 7TV set link"
            selected={set}
            onSelect={(next) => {
              setSet(next);
              setSetError(undefined);
              setNewName(undefined);
              if (runState.kind !== 'running') setRunState({ kind: 'idle' });
            }}
            initialQuery={channel}
            error={setError}
            inputRef={setInput}
          />
        </section>

        <section className={styles.step} aria-labelledby="dial-heading">
          <h2 id="dial-heading" className={styles.stepHeading}>
            <span className={styles.stepNumber} aria-hidden="true">
              3
            </span>
            Season and mode
          </h2>
          <div className={styles.console}>
            <div className={styles.knob}>
              <Knob<SeasonId> label="Season" options={SEASON_OPTIONS} value={season} onChange={setSeason} />
            </div>
            <div className={styles.knob}>
              <Knob<RunMode> label="Mode" options={MODE_OPTIONS} value={mode} onChange={setMode} />
            </div>
            <p className={styles.consoleNote}>
              <strong>{MODE_NAMES[mode]}.</strong> {modeDescription(mode, label)}
            </p>
          </div>

          {mode === 'in-place' && (
            <p className={styles.plate}>
              <strong>This changes your set directly.</strong> Revert uses the {label} preset in reverse and may not
              restore every emote exactly. Undo restores it exactly, but only from this browser.
            </p>
          )}

          {mode === 'duplicate' && (
            <div className={styles.target}>
              {targetKind === 'new' ? (
                <>
                  <DeckField
                    label="Name of the new set"
                    value={copyName}
                    onChange={(value) => {
                      setNewName(value);
                      setTargetError(undefined);
                    }}
                    error={targetError}
                    placeholder="e.g. Main (Halloween)"
                  />
                  <button type="button" className={styles.textButton} onClick={() => setTargetKind('existing')}>
                    Fill an existing empty set instead
                  </button>
                </>
              ) : (
                <>
                  <SetPicker
                    label="Set to fill"
                    selected={existingTarget}
                    onSelect={(next) => {
                      setExistingTarget(next);
                      setTargetError(undefined);
                    }}
                    initialQuery={channel}
                    error={targetError}
                  />
                  {existingTarget && existingTarget.emotes.length > 0 && (
                    <p className={styles.note}>
                      “{existingTarget.name}” already holds {plural(existingTarget.emotes.length, 'emote', 'emotes')}.
                      7TV will refuse any that are already in it.
                    </p>
                  )}
                  <button type="button" className={styles.textButton} onClick={() => setTargetKind('new')}>
                    Make a new set instead
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        <section className={styles.step} aria-labelledby="preview-heading">
          <h2 id="preview-heading" className={styles.stepHeading}>
            <span className={styles.stepNumber} aria-hidden="true">
              4
            </span>
            Check the swaps
          </h2>
          {!set && <p className={styles.stepLede}>Pick a set above to see every swap before anything changes.</p>}
          {set && preset === 'failed' && (
            <p className={styles.plate}>
              <strong>The {label} preset didn’t load.</strong> Reload the page to try again.
            </p>
          )}
          {set && preset === 'loading' && <p className={styles.stepLede}>Loading the {label} preset…</p>}
          {plan && (
            <>
              <p className={styles.stepLede}>
                {plan.unmapped > 0 &&
                  (mode === 'revert'
                    ? `${plural(plan.unmapped, 'emote has', 'emotes have')} no normal version in the ${label} preset. `
                    : `${plural(plan.unmapped, 'emote has', 'emotes have')} no ${label} version yet. `)}
                {plan.alreadyThere > 0 &&
                  `${plural(plan.alreadyThere, 'swap is', 'swaps are')} left out because the other version is already in the set. `}
                {mode === 'duplicate' && plan.swaps.length > 0 && 'Unticked emotes are copied unchanged.'}
              </p>
              {plan.swaps.length > 0 ? (
                <SwapList
                  label="Swaps"
                  items={plan.swaps.map((s) => ({ key: s.fromId, alias: s.alias, fromId: s.fromId, toId: s.toId }))}
                  unticked={unticked}
                  onChange={setUnticked}
                />
              ) : (
                <p className={styles.plate}>
                  <strong>Nothing to swap in this set.</strong>{' '}
                  {mode === 'revert'
                    ? `None of its emotes are ${label} versions the preset knows.`
                    : `None of its emotes have a ${label} version in the preset yet.`}
                </p>
              )}
            </>
          )}
        </section>

        <section className={styles.runBar} aria-label="Run">
          <AmberScreen className={styles.runScreen} busy={running}>
            {readout}
          </AmberScreen>
          <ActionKey className={styles.runKey} onClick={() => void run()} busy={running}>
            {mode === 'revert' ? 'Revert' : 'Make seasonal'}
          </ActionKey>
        </section>

        {runState.kind === 'failed' && (
          <p className={styles.plate} role="alert">
            {runState.message}
          </p>
        )}
        {runState.kind === 'done' && <RunSummary report={runState.report} />}

        {(runs.length > 0 || undoResult) && (
          <section className={styles.step} aria-labelledby="runs-heading">
            <h2 id="runs-heading" className={styles.sectionHeading}>
              Recent runs
            </h2>
            <p className={styles.stepLede}>
              Undo reverses exactly what a run did and leaves alone anything you’ve changed since. It works from this
              browser, for your last 10 runs.
            </p>
            {undoResult && <UndoSummary result={undoResult} />}
            <ul className={styles.runs}>
              {runs.map((record) => (
                <li key={record.id} className={styles.runRow}>
                  <div className={styles.runText}>
                    <p className={styles.runName}>{record.setName}</p>
                    <p className={styles.runMeta}>
                      {MODE_NAMES[record.mode]} · {seasonLabel(record.season)} · {when(record.at)}
                    </p>
                  </div>
                  <GunmetalKey size="small" busy={undoing === record.id} onClick={() => void undo(record)}>
                    {undoing === record.id ? 'Undoing…' : 'Undo'}
                  </GunmetalKey>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

function RunSummary({ report }: { report: RunReport }) {
  const { record } = report;
  return (
    <section className={styles.report} aria-labelledby="report-heading">
      <h2 id="report-heading" className={styles.sectionHeading}>
        {report.stopped ? 'Run stopped' : 'Run finished'}
      </h2>
      {report.stopped && (
        <p className={styles.plate}>
          <strong>{report.stopped}</strong> What was done so far is listed below and can be undone.
        </p>
      )}
      <p className={styles.stepLede}>
        {record.mode === 'duplicate'
          ? `“${record.setName}” now has ${plural(report.swapped, 'seasonal emote', 'seasonal emotes')}${
              report.copied ? ` and ${report.copied} unchanged` : ''
            }. Switch to it on 7TV when you go live.`
          : `${plural(report.swapped, 'emote', 'emotes')} swapped in “${record.setName}”.`}{' '}
        <a href={seventvSetUrl(record.setId)} target="_blank" rel="noreferrer">
          Open it on 7TV
        </a>
      </p>
      {report.lost.length > 0 && (
        <p className={styles.plate}>
          <strong>
            {plural(report.lost.length, 'emote is', 'emotes are')} missing from the set now: {report.lost.join(', ')}.
          </strong>{' '}
          7TV refused both the swap and putting the original back. Add {report.lost.length === 1 ? 'it' : 'them'} back
          on 7TV.
        </p>
      )}
      {report.renamed.length > 0 && (
        <div className={styles.listBlock}>
          <p className={styles.listHeading}>Renamed to fit 7TV’s rules</p>
          <ul className={styles.facts}>
            {report.renamed.map((r) => (
              <li key={r.from}>
                {r.from} → {r.to}
              </li>
            ))}
          </ul>
        </div>
      )}
      {report.failed.length > 0 && (
        <div className={styles.listBlock}>
          <p className={styles.listHeading}>{plural(report.failed.length, 'emote', 'emotes')} not swapped</p>
          <ul className={styles.facts}>
            {report.failed.map((f, i) => (
              <li key={`${f.alias}-${i}`}>
                {f.alias}: {f.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function UndoSummary({ result }: { result: UndoResult }) {
  const { record, report, error } = result;
  if (error) {
    return (
      <p className={styles.plate} role="alert">
        <strong>Undo didn’t finish:</strong> {error}
      </p>
    );
  }
  if (!report) return null;
  if (record.createdSet) {
    return report.deletedSet ? (
      <p className={styles.note} role="status">
        Deleted “{record.setName}” from 7TV.
      </p>
    ) : (
      <p className={styles.plate} role="status">
        <strong>7TV wouldn’t let this tool delete “{record.setName}”.</strong>{' '}
        <a href={seventvSetUrl(record.setId)} target="_blank" rel="noreferrer">
          Delete it on 7TV
        </a>{' '}
        yourself.
      </p>
    );
  }
  return (
    <div className={styles.note} role="status">
      <p>
        Put back {plural(report.restored, 'emote', 'emotes')} in “{record.setName}”.
      </p>
      {report.skipped.length > 0 && (
        <p>
          Left {plural(report.skipped.length, 'emote', 'emotes')} alone because{' '}
          {report.skipped.length === 1 ? 'it' : 'they'} changed since the run: {report.skipped.join(', ')}.
        </p>
      )}
      {report.failed.length > 0 && (
        <p>
          7TV refused {report.failed.map((f) => f.alias).join(', ')}. The run stays in the list so you can try again.
        </p>
      )}
    </div>
  );
}
