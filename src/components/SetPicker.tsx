import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react';
import { flushSync } from 'react-dom';
import {
  fetchChannelSets,
  fetchEmoteSet,
  parseChannel,
  parseSetRef,
  seventvSetUrl,
  type EmoteSet,
  type SetSummary,
} from '@shared/seventv';
import { DeckField } from '../design/DeckField';
import { GunmetalKey } from '../design/GunmetalKey';
import styles from './SetPicker.module.css';

type Phase =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'list'; channel: string; sets: SetSummary[] }
  | { kind: 'loading'; channel?: string; sets?: SetSummary[]; id: string };

interface SetPickerProps {
  label: string;
  selected: EmoteSet | null;
  onSelect(set: EmoteSet | null): void;
  /** Prefill, e.g. the channel typed on the landing page; searched straight away. */
  initialQuery?: string;
  /** Set by the page, e.g. "Pick a set first." */
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
}

const message = (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong. Try again.');

/**
 * Finds a 7TV set by channel name (listing that channel's sets) or by a pasted
 * set link. One field takes either, so the two can be mixed freely.
 */
export function SetPicker({ label, selected, onSelect, initialQuery = '', error, inputRef }: SetPickerProps) {
  const [query, setQuery] = useState(initialQuery);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [problem, setProblem] = useState<string>();
  const latest = useRef(0);

  const load = async (id: string, list?: { channel: string; sets: SetSummary[] }) => {
    const ticket = ++latest.current;
    setProblem(undefined);
    setPhase({ kind: 'loading', id, ...list });
    try {
      const set = await fetchEmoteSet(id);
      if (ticket !== latest.current) return;
      setPhase(list ? { kind: 'list', ...list } : { kind: 'idle' });
      onSelect(set);
    } catch (e) {
      if (ticket !== latest.current) return;
      setPhase(list ? { kind: 'list', ...list } : { kind: 'idle' });
      setProblem(message(e));
    }
  };

  const find = async (text: string) => {
    const ref = parseSetRef(text);
    if (ref) return load(ref);
    const login = parseChannel(text);
    if (!login) {
      flushSync(() => setProblem('Type a channel name, or paste a 7TV set link.'));
      return;
    }
    const ticket = ++latest.current;
    setProblem(undefined);
    setPhase({ kind: 'searching' });
    try {
      const found = await fetchChannelSets(login);
      if (ticket !== latest.current) return;
      if (found.sets.length === 0) {
        setPhase({ kind: 'idle' });
        setProblem(`${found.channel} has no emote sets on 7TV yet.`);
        return;
      }
      setPhase({ kind: 'list', ...found });
    } catch (e) {
      if (ticket !== latest.current) return;
      setPhase({ kind: 'idle' });
      setProblem(message(e));
    }
  };

  useEffect(() => {
    if (initialQuery.trim()) void find(initialQuery);
    // Only the prefill on arrival; later searches are the user's.
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void find(query);
  };

  if (selected) {
    return (
      <div className={styles.chosen}>
        <div className={styles.chosenText}>
          <p className={styles.chosenName}>{selected.name}</p>
          <p className={styles.chosenMeta}>
            {selected.emotes.length} emotes{selected.owner ? ` · owned by ${selected.owner.name}` : ''} ·{' '}
            <a href={seventvSetUrl(selected.id)} target="_blank" rel="noreferrer">
              open on 7TV
            </a>
          </p>
        </div>
        <GunmetalKey size="small" onClick={() => onSelect(null)}>
          Change
        </GunmetalKey>
      </div>
    );
  }

  const list =
    phase.kind === 'list' || (phase.kind === 'loading' && phase.channel && phase.sets)
      ? { channel: phase.channel!, sets: phase.sets! }
      : null;

  return (
    <div className={styles.picker}>
      <form className={styles.search} onSubmit={submit} noValidate>
        <DeckField
          label={label}
          placeholder="channel or 7tv.app/emote-sets/…"
          value={query}
          onChange={(value) => {
            setQuery(value);
            setProblem(undefined);
          }}
          error={problem ?? error}
          inputRef={inputRef}
        />
        <GunmetalKey type="submit" className={styles.find} busy={phase.kind === 'searching'}>
          {phase.kind === 'searching' ? 'Finding…' : 'Find'}
        </GunmetalKey>
      </form>

      {list && (
        <div className={styles.results}>
          <p className={styles.resultsHeading}>{list.channel}’s sets on 7TV</p>
          <ul className={styles.sets}>
            {list.sets.map((set) => {
              const loading = phase.kind === 'loading' && phase.id === set.id;
              return (
                <li key={set.id}>
                  <button
                    type="button"
                    className={styles.set}
                    aria-busy={loading || undefined}
                    onClick={() => void load(set.id, list)}
                  >
                    <span className={styles.lamp} data-on={set.active || undefined} aria-hidden="true" />
                    <span className={styles.setName}>{set.name}</span>
                    {set.active && <span className={styles.setNote}>active</span>}
                    {loading && <span className={styles.setNote}>loading…</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
