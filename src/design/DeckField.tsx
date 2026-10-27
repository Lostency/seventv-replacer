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
  type?: 'text' | 'password';
  /** A standing note under the field, e.g. where the value is kept. */
  hint?: string;
}

/** A labelled input set into the deck like a key well. */
export function DeckField({
  label,
  value,
  onChange,
  error,
  placeholder,
  inputRef,
  autoComplete = 'off',
  type = 'text',
  hint,
}: DeckFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        ref={inputRef}
        className={styles.input}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
