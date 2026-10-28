import { useEffect } from 'react';
import { GunmetalKey } from './GunmetalKey';
import styles from './UndoToast.module.css';

interface UndoToastProps {
  message: string;
  onUndo(): void;
  /** Called once the toast has been up for `timeoutMs`. */
  onDone(): void;
  timeoutMs?: number;
}

/** A short note after a decision, with one way back. */
export function UndoToast({ message, onUndo, onDone, timeoutMs = 8000 }: UndoToastProps) {
  useEffect(() => {
    const timer = setTimeout(onDone, timeoutMs);
    return () => clearTimeout(timer);
  }, [message, onDone, timeoutMs]);

  return (
    <div className={styles.toast} role="status">
      <span className={styles.message}>{message}</span>
      <GunmetalKey size="small" onClick={onUndo}>
        Undo
      </GunmetalKey>
    </div>
  );
}
