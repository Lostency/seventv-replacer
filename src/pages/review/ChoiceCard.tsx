import type { Candidate } from '@shared/types';
import { GunmetalKey } from '../../design/GunmetalKey';
import { Keycap } from '../../design/Keycap';
import styles from './review.module.css';

interface ChoiceCardProps {
  /** Every waiting option for one emote, most channels first; all share the original and its current mapping. */
  options: Candidate[];
  /** `null` keeps the current mapping, or, with none, rejects every option. */
  onKeep(replacementId: string | null): void;
  busy: boolean;
}

const channels = (n: number) => `Seen in ${n} ${n === 1 ? 'channel' : 'channels'}`;

/** One emote with several possible seasonal versions: all side by side, and one to keep. */
export function ChoiceCard({ options, onKeep, busy }: ChoiceCardProps) {
  const { alias, originalId, current } = options[0]!;
  return (
    <li className={`${styles.card} ${styles.choice}`}>
      <div className={styles.choiceHead}>
        <Keycap emoteId={originalId} alt={`${alias}, normal`} />
        <p className={styles.line}>
          {alias} · {options.length} {options.length === 1 ? 'option' : 'options'}
        </p>
      </div>
      <ul className={styles.options} aria-label={`Seasonal versions of ${alias}`}>
        {current && (
          <li className={styles.option}>
            <Keycap emoteId={current} alt={`${alias}, current`} tone="putty" state="flipped" />
            <span className={styles.optionLabel}>Current</span>
            <GunmetalKey size="small" onClick={() => onKeep(null)} busy={busy} label="Keep current">
              Keep
            </GunmetalKey>
          </li>
        )}
        {options.map((o, i) => (
          <li key={o.replacementId} className={styles.option}>
            <Keycap emoteId={o.replacementId} alt={`${alias}, option ${i + 1}`} tone="putty" />
            <span className={styles.optionLabel}>{channels(o.channels)}</span>
            <GunmetalKey size="small" onClick={() => onKeep(o.replacementId)} busy={busy} label={`Keep option ${i + 1}`}>
              Keep
            </GunmetalKey>
          </li>
        ))}
      </ul>
      {!current && (
        <div className={styles.actions}>
          <GunmetalKey size="small" onClick={() => onKeep(null)} busy={busy}>
            Reject all
          </GunmetalKey>
        </div>
      )}
    </li>
  );
}
