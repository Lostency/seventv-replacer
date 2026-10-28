import { useEffect } from 'react';
import styles from './UndoToast.module.css';

interface NoticeProps {
  message: string | null;
  /** Called once the notice has been up for `timeoutMs`. */
  onDone(): void;
  timeoutMs?: number;
}

/**
 * A short note that something happened while work goes on, like the toast without a way back.
 * The live region stays mounted so screen readers announce each new message.
 */
export function Notice({ message, onDone, timeoutMs = 6000 }: NoticeProps) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDone, timeoutMs);
    return () => clearTimeout(timer);
  }, [message, onDone, timeoutMs]);

  return (
    <div aria-live="polite">
      {message && (
        <p className={styles.toast}>
          <span className={styles.message}>{message}</span>
        </p>
      )}
    </div>
  );
}
