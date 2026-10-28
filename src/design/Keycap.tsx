import { useState } from 'react';
import { emoteCdnUrl, emoteImageUrl, emotePageUrl } from '../lib/emote-image';
import styles from './Keycap.module.css';

export type KeycapState = 'idle' | 'flipped' | 'unmapped';

interface KeycapProps {
  /** Omitted for a blank cap (loading, or nothing to show). */
  emoteId?: string;
  alt: string;
  legend?: string;
  state?: KeycapState;
  pressed?: boolean;
  tone?: 'bone' | 'putty';
}

/**
 * One emote printed on a PBT keycap. Hovering magnifies the art; clicking opens the emote on 7TV in a new tab.
 * A cap with an empty `alt` is decorative: still clickable, but kept out of the tab order and the accessibility tree.
 */
export function Keycap({ emoteId, alt, legend, state = 'idle', pressed = false, tone = 'bone' }: KeycapProps) {
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const shared = { className: styles.key, 'data-state': state, 'data-pressed': pressed || undefined, 'data-tone': tone };
  const legendText = legend && (
    <span className={styles.legend} aria-hidden="true">
      {legend}
    </span>
  );

  if (!emoteId) return <div {...shared}>{legendText}</div>;

  return (
    <a
      {...shared}
      href={emotePageUrl(emoteId)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={alt ? `${alt} on 7TV` : undefined}
      aria-hidden={alt ? undefined : true}
      tabIndex={alt ? undefined : -1}
    >
      <img
        className={styles.art}
        src={failedFor === emoteId ? emoteCdnUrl(emoteId) : emoteImageUrl(emoteId)}
        alt={alt}
        width={56}
        height={56}
        loading="lazy"
        decoding="async"
        onError={() => setFailedFor(emoteId)}
      />
      {legendText}
    </a>
  );
}
