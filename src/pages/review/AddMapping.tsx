import { ArrowRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { SeasonId } from '@shared/seasons';
import { parseEmoteRef } from '@shared/seventv';
import type { MappingWritten } from '@shared/types';
import { writeMapping } from '../../api';
import { DeckField } from '../../design/DeckField';
import { GunmetalKey } from '../../design/GunmetalKey';
import { Keycap } from '../../design/Keycap';
import styles from './review.module.css';

interface AddMappingProps {
  season: SeasonId;
  /** Called after a mapping went in, with what it replaced. */
  onAdded(originalId: string, result: MappingWritten): void;
  onProblem(message: string): void;
}

const NOT_AN_EMOTE = 'That isn’t a 7TV emote link.';

/** A mapping from two pasted links, for swaps no channel has shown yet. */
export function AddMapping({ season, onAdded, onProblem }: AddMappingProps) {
  const [normal, setNormal] = useState('');
  const [seasonal, setSeasonal] = useState('');
  const [errors, setErrors] = useState<{ normal?: string; seasonal?: string }>({});
  const [busy, setBusy] = useState(false);
  const originalId = parseEmoteRef(normal);
  const replacementId = parseEmoteRef(seasonal);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const next = { normal: originalId ? undefined : NOT_AN_EMOTE, seasonal: replacementId ? undefined : NOT_AN_EMOTE };
    if (originalId && originalId === replacementId) next.seasonal = 'Pick two different emotes.';
    setErrors(next);
    if (next.normal || next.seasonal || !originalId || !replacementId) return;

    setBusy(true);
    try {
      const result = await writeMapping({ season, originalId, replacementId, source: 'manual' });
      setNormal('');
      setSeasonal('');
      onAdded(originalId, result);
    } catch (error) {
      onProblem(error instanceof Error ? error.message : 'The mapping didn’t save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.add} onSubmit={(e) => void submit(e)} noValidate>
      <DeckField
        label="Normal emote link"
        value={normal}
        onChange={(value) => {
          setNormal(value);
          setErrors((e) => ({ ...e, normal: undefined }));
        }}
        error={errors.normal}
        placeholder="https://7tv.app/emotes/…"
      />
      <DeckField
        label="Seasonal emote link"
        value={seasonal}
        onChange={(value) => {
          setSeasonal(value);
          setErrors((e) => ({ ...e, seasonal: undefined }));
        }}
        error={errors.seasonal}
        placeholder="https://7tv.app/emotes/…"
      />
      <div className={styles.addFoot}>
        <div className={styles.pair} aria-hidden="true">
          <Keycap emoteId={originalId ?? undefined} alt="" />
          <ArrowRight className={styles.arrow} size={20} strokeWidth={2.5} />
          <Keycap emoteId={replacementId ?? undefined} alt="" tone="putty" />
        </div>
        <GunmetalKey type="submit" busy={busy}>
          Add mapping
        </GunmetalKey>
      </div>
    </form>
  );
}
