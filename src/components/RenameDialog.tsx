import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { DeckField } from '../design/DeckField';
import { GunmetalKey } from '../design/GunmetalKey';
import type { AliasQuestion } from '../lib/run';
import styles from './RenameDialog.module.css';

export interface PendingQuestion {
  question: AliasQuestion;
  /** A name to try, or null to skip; skipRest skips any later refusal in this run without asking. */
  answer(name: string | null, skipRest?: boolean): void;
}

/** The run is paused: 7TV refused an emote's name, and only the user can say what to call it instead. */
export function RenameDialog({ pending, season }: { pending: PendingQuestion; season: string }) {
  const { question, answer } = pending;
  const [name, setName] = useState(question.suggestion);
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    setName(question.suggestion);
    setError(undefined);
    input.current?.focus();
    input.current?.select();
  }, [question]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Type a name, or skip this emote.');
      return;
    }
    answer(name.trim());
  };

  return (
    <div className={styles.backdrop}>
      <form
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        onSubmit={submit}
        noValidate
      >
        <h2 id={`${id}-title`} className={styles.title}>
          7TV refused the name “{question.alias}”
        </h2>
        <div id={`${id}-body`} className={styles.body}>
          <p>
            7TV said: “{question.reason}”. The run is paused until you choose.
          </p>
          <p>
            {question.role === 'seasonal'
              ? `This is the ${season} version going in. Pick a name 7TV accepts, or skip it.`
              : 'This is your normal emote going back in. Pick a name 7TV accepts, or skip it.'}
          </p>
        </div>
        <DeckField
          label="New name"
          value={name}
          onChange={(value) => {
            setName(value);
            setError(undefined);
          }}
          error={error}
          inputRef={input}
        />
        <div className={styles.actions}>
          <GunmetalKey type="submit">Use this name</GunmetalKey>
          <button type="button" className={styles.textButton} onClick={() => answer(null)}>
            Skip this emote
          </button>
          <button type="button" className={styles.textButton} onClick={() => answer(null, true)}>
            Skip all refused names
          </button>
        </div>
      </form>
    </div>
  );
}
