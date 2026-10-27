import type { ReactNode } from 'react';
import styles from './AmberScreen.module.css';

/** The deck's one readout. Reports one value at a time and announces changes politely. */
export function AmberScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={[styles.bezel, className].filter(Boolean).join(' ')}>
      <div className={styles.glass} role="status" aria-live="polite">
        {children}
      </div>
    </div>
  );
}
