import styles from './TickBox.module.css';

interface TickBoxProps {
  checked: boolean;
  onChange(checked: boolean): void;
  label: string;
}

/** A checkbox printed like a small key: hollow when off, filled with a check when on. */
export function TickBox({ checked, onChange, label }: TickBoxProps) {
  return (
    <input
      type="checkbox"
      className={styles.box}
      checked={checked}
      aria-label={label}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}
