import { useId, type Ref } from 'react';
import styles from './DeckField.module.css';

interface DeckFieldProps {
  label: string;
  value: string;
  onChange(value: string): void;
  error?: string;
  placeholder?: string;
  inputRef?: Ref<HTMLInputElement>;
  autoComplete?: string;
}

/** A labelled input set into the deck like a key well. */
export function DeckField({ label, value, onChange, error, placeholder, inputRef, autoComplete = 'off' }: DeckFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        className={styles.input}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
