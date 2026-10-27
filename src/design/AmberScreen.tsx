import type { ReactNode } from 'react';
import styles from './AmberScreen.module.css';

interface AmberScreenProps {
  children: ReactNode;
  className?: string;
  /** While true, assistive tech holds announcements until the readout settles. */
  busy?: boolean;
}

/** The deck's one readout. Reports one value at a time and announces changes politely. */
export function AmberScreen({ children, className, busy }: AmberScreenProps) {
  return (
    <div className={[styles.bezel, className].filter(Boolean).join(' ')}>
      <div className={styles.glass} role="status" aria-live="polite" aria-busy={busy || undefined}>
        {children}
      </div>
    </div>
  );
}
