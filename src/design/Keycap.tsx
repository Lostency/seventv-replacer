import { useState } from 'react';
import { emoteCdnUrl, emoteImageUrl } from '../lib/emote-image';
import styles from './Keycap.module.css';

export type KeycapState = 'idle' | 'flipped' | 'unmapped';

interface KeycapProps {
  emoteId: string;
  alt: string;
  legend?: string;
  state?: KeycapState;
  pressed?: boolean;
  tone?: 'bone' | 'putty';
}

/** One emote printed on a PBT keycap. Display only: the deck's real controls are the knob and the action key. */
export function Keycap({ emoteId, alt, legend, state = 'idle', pressed = false, tone = 'bone' }: KeycapProps) {
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const src = failedFor === emoteId ? emoteCdnUrl(emoteId) : emoteImageUrl(emoteId);

  return (
    <div className={styles.key} data-state={state} data-pressed={pressed || undefined} data-tone={tone}>
      <img
        className={styles.art}
        src={src}
        alt={alt}
        width={56}
        height={56}
        loading="lazy"
        decoding="async"
        onError={() => setFailedFor(emoteId)}
      />
      {legend && (
        <span className={styles.legend} aria-hidden="true">
          {legend}
        </span>
      )}
    </div>
  );
}
