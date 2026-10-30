import { ArrowRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { seasonLabel, type SeasonId } from '@shared/seasons';
import { parseEmoteRef } from '@shared/seventv';
import type { AdminMapping, BrokenEmote, MappingWritten } from '@shared/types';
import { deleteMapping, dismissBroken, writeMapping } from '../../api';
import { DeckField } from '../../design/DeckField';
import { GunmetalKey } from '../../design/GunmetalKey';
import { Keycap } from '../../design/Keycap';
import workbench from '../Workbench.module.css';
import styles from './review.module.css';

interface BrokenEmotesProps {
  season: SeasonId;
  broken: BrokenEmote[] | 'loading' | 'failed';
  onReplaced(originalId: string, result: MappingWritten): void;
  onDeleted(row: AdminMapping | null): void;
  onDismissed(row: BrokenEmote): void;
  onProblem(message: string): void;
}

const when = (sqlTime: string) =>
  new Date(`${sqlTime.replace(' ', 'T')}Z`).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' });
const times = (n: number) => (n === 1 ? 'once' : `${n} times`);
const reasonOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** Mappings whose emote Replace runs found gone or unusable on 7TV, with what 7TV said and the ways to fix them. */
export function BrokenEmotes({ season, broken, onReplaced, onDeleted, onDismissed, onProblem }: BrokenEmotesProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);

  /** Runs one action on a report; the page updates the lists afterwards. */
  const act = async (originalId: string, action: () => Promise<void>, fallback: string) => {
    setBusy(originalId);
    try {
      await action();
    } catch (error) {
      onProblem(reasonOf(error, fallback));
    } finally {
      setBusy(null);
    }
  };

  if (broken === 'loading') return <p className={workbench.stepLede}>Loading broken emotes…</p>;
  if (broken === 'failed') {
    return (
      <p className={workbench.plate} role="alert">
        Broken emotes didn’t load. Reload the page to try again.
      </p>
    );
  }
  if (broken.length === 0) {
    return <p className={workbench.stepLede}>No run has found a broken emote in the {seasonLabel(season)} preset.</p>;
  }

  return (
    <ul className={styles.brokenList} aria-label={`Broken ${seasonLabel(season)} emotes`}>
      {broken.map((b) => {
        const seasonalBroke = b.brokenId === b.replacementId;
        return (
          <li key={b.originalId} className={styles.card}>
            <div className={styles.pair}>
              <Keycap emoteId={b.originalId} alt={`${b.originalId}, normal`} state={seasonalBroke ? 'idle' : 'unmapped'} />
              <ArrowRight className={styles.arrow} size={20} strokeWidth={2.5} aria-hidden="true" />
              <Keycap
                emoteId={b.replacementId}
                alt={`${b.originalId}, seasonal`}
                tone="putty"
                state={seasonalBroke ? 'unmapped' : 'idle'}
              />
            </div>
            <p className={styles.line}>
              {seasonalBroke ? 'The seasonal emote broke' : 'The normal emote broke'}. 7TV said: “{b.reason}”
            </p>
            <p className={styles.brokenMeta}>
              Reported {times(b.reports)} · first {when(b.firstSeen)} · last {when(b.lastSeen)}
            </p>
            {replacing === b.originalId ? (
              <ReplaceForm
                busy={busy === b.originalId}
                onCancel={() => setReplacing(null)}
                onSave={(replacementId) =>
                  act(
                    b.originalId,
                    async () => {
                      const result = await writeMapping({ season, originalId: b.originalId, replacementId, source: 'manual' });
                      setReplacing(null);
                      onReplaced(b.originalId, result);
                    },
                    'The mapping didn’t save. Try again.',
                  )
                }
              />
            ) : (
              <div className={styles.actions}>
                {seasonalBroke && (
                  <GunmetalKey size="small" label={`Replace ${b.originalId}`} onClick={() => setReplacing(b.originalId)}>
                    Replace
                  </GunmetalKey>
                )}
                <GunmetalKey
                  size="small"
                  busy={busy === b.originalId}
                  label={`Delete mapping ${b.originalId}`}
                  onClick={() =>
                    void act(
                      b.originalId,
                      async () => onDeleted((await deleteMapping(season, b.originalId)).deleted),
                      'The mapping wasn’t deleted. Try again.',
                    )
                  }
                >
                  Delete mapping
                </GunmetalKey>
                <GunmetalKey
                  size="small"
                  busy={busy === b.originalId}
                  label={`Dismiss ${b.originalId}`}
                  onClick={() =>
                    void act(
                      b.originalId,
                      async () => {
                        const { dismissed } = await dismissBroken(season, b);
                        if (dismissed) onDismissed(dismissed);
                      },
                      'The report wasn’t dismissed. Try again.',
                    )
                  }
                >
                  Dismiss
                </GunmetalKey>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ReplaceForm({ busy, onSave, onCancel }: { busy: boolean; onSave(id: string): void; onCancel(): void }) {
  const [link, setLink] = useState('');
  const [error, setError] = useState<string>();
  const replacementId = parseEmoteRef(link);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!replacementId) {
      setError('That isn’t a 7TV emote link.');
      return;
    }
    onSave(replacementId);
  };

  return (
    <form className={styles.replace} onSubmit={submit} noValidate>
      <DeckField
        label="New seasonal emote link"
        value={link}
        onChange={(value) => {
          setLink(value);
          setError(undefined);
        }}
        error={error}
        placeholder="https://7tv.app/emotes/…"
      />
      <div className={styles.actions}>
        <GunmetalKey type="submit" size="small" busy={busy}>
          Save
        </GunmetalKey>
        <button type="button" className={workbench.textButton} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
