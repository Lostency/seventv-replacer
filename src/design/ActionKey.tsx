import type { ReactNode } from 'react';
import styles from './ActionKey.module.css';

interface ActionKeyProps {
  type?: 'button' | 'submit';
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  /** While a run is going: the key stays down and ignores presses. */
  busy?: boolean;
}

/** The safety-orange key. Commits the one action that matters; nothing else on a page is orange. */
export function ActionKey({ type = 'button', children, onClick, className, busy }: ActionKeyProps) {
  return (
    <button
      type={type}
      onClick={busy ? undefined : onClick}
      aria-disabled={busy || undefined}
      className={[styles.key, className].filter(Boolean).join(' ')}
    >
      <span className={styles.legend}>{children}</span>
    </button>
  );
}
