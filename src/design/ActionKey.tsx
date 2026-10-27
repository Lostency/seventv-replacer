import type { ReactNode } from 'react';
import styles from './ActionKey.module.css';

interface ActionKeyProps {
  type?: 'button' | 'submit';
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

/** The safety-orange key. Commits the one action that matters; nothing else on a page is orange. */
export function ActionKey({ type = 'button', children, onClick, className }: ActionKeyProps) {
  return (
    <button type={type} onClick={onClick} className={[styles.key, className].filter(Boolean).join(' ')}>
      <span className={styles.legend}>{children}</span>
    </button>
  );
}
