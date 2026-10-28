import { ArrowRight } from 'lucide-react';
import type { Candidate } from '@shared/types';
import { GunmetalKey } from '../../design/GunmetalKey';
import { Keycap } from '../../design/Keycap';
import styles from './review.module.css';

interface ReviewCardProps {
  candidate: Candidate;
  onAccept(): void;
  onReject(): void;
  busy: boolean;
}

const channels = (n: number) => `${n} ${n === 1 ? 'channel' : 'channels'}`;

/** The only option for an emote with no mapping yet: the two emotes side by side, and the call to make. */
export function ReviewCard({ candidate, onAccept, onReject, busy }: ReviewCardProps) {
  const { alias, originalId, replacementId } = candidate;
  return (
    <li className={styles.card}>
      <div className={styles.pair}>
        <Keycap emoteId={originalId} alt={`${alias}, normal`} />
        <ArrowRight className={styles.arrow} size={20} strokeWidth={2.5} aria-hidden="true" />
        <Keycap emoteId={replacementId} alt={`${alias}, seasonal`} tone="putty" state="flipped" />
      </div>
      <p className={styles.line}>
        {alias} → {alias} · seen in {channels(candidate.channels)}
      </p>
      <div className={styles.actions}>
        <GunmetalKey size="small" onClick={onAccept} busy={busy}>
          Accept
        </GunmetalKey>
        <GunmetalKey size="small" onClick={onReject} busy={busy}>
          Reject
        </GunmetalKey>
      </div>
    </li>
  );
}
