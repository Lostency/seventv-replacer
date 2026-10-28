import { ArrowRight } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { DeckField } from '../design/DeckField';
import { GunmetalKey } from '../design/GunmetalKey';
import { Keycap } from '../design/Keycap';
import { suggestAlias } from '../lib/alias';
import type { RunProblem } from '../lib/run';
import workbench from '../pages/Workbench.module.css';
import styles from './ProblemList.module.css';

interface ProblemListProps {
  problems: RunProblem[];
  /** Fixes waiting for the running run's next break. */
  queued: ReadonlySet<string>;
  /** The problem whose fix is going in right now. */
  fixing: string | null;
  onFix(problem: RunProblem, name: string): void;
  onDismiss(problem: RunProblem): void;
}

function explain(problem: RunProblem): string {
  if (problem.kind === 'broken') {
    return `The emote to swap in is gone or unusable on 7TV (${problem.reason}). The one it would replace stays, and the admins have been told.`;
  }
  if (problem.kind === 'missing') return `Not in the set now: ${problem.reason}. Give it a name 7TV accepts to add it.`;
  return `7TV refused it: ${problem.reason}. The normal emote is in its place until you try a new name.`;
}

/** Emotes runs set aside, by set, each with its fix: they stay until they're in or dismissed. */
export function ProblemList({ problems, queued, fixing, onFix, onDismiss }: ProblemListProps) {
  const bySet = new Map<string, RunProblem[]>();
  for (const p of problems) bySet.set(p.setId, [...(bySet.get(p.setId) ?? []), p]);

  return (
    <section className={workbench.step} aria-labelledby="problems-heading">
      <h2 id="problems-heading" className={workbench.sectionHeading}>
        Problems
      </h2>
      <p className={workbench.stepLede}>
        Emotes a run set aside instead of stopping. Fix them now, even while a run is going, or later: they stay here until
        they’re in or you dismiss them.
      </p>
      {[...bySet.values()].map((list) => (
        <div key={list[0]!.setId} className={styles.set}>
          <h3 className={styles.setName}>{list[0]!.setName}</h3>
          <ul className={styles.list}>
            {list.map((p) => (
              <ProblemRow
                key={p.id}
                problem={p}
                queued={queued.has(p.id)}
                busy={fixing === p.id}
                onFix={(name) => onFix(p, name)}
                onDismiss={() => onDismiss(p)}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

interface ProblemRowProps {
  problem: RunProblem;
  queued: boolean;
  busy: boolean;
  onFix(name: string): void;
  onDismiss(): void;
}

function ProblemRow({ problem, queued, busy, onFix, onDismiss }: ProblemRowProps) {
  const { alias, kind, normalId, emoteId } = problem;
  const [name, setName] = useState(() => suggestAlias(alias));
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Type a name, or dismiss this emote.');
      return;
    }
    onFix(name.trim());
  };

  return (
    <li className={styles.row}>
      <div className={styles.pair}>
        {normalId && <Keycap emoteId={normalId} alt={`${alias}, normal`} />}
        {normalId && <ArrowRight className={styles.arrow} size={18} strokeWidth={2.5} aria-hidden="true" />}
        <Keycap emoteId={emoteId} alt={alias} tone="putty" />
      </div>
      <div className={styles.body}>
        <p className={styles.alias}>{alias}</p>
        <p className={styles.explain}>{explain(problem)}</p>
        {queued && <p className={styles.queued}>Goes in after the run’s current batch.</p>}
        {kind !== 'broken' ? (
          <form className={styles.fix} onSubmit={submit} noValidate>
            <DeckField
              label={`New name for ${alias}`}
              value={name}
              onChange={(value) => {
                setName(value);
                setError(undefined);
              }}
              error={error}
            />
            <GunmetalKey type="submit" size="small" busy={busy || queued} label={`Retry ${alias}`}>
              Retry
            </GunmetalKey>
            <button type="button" className={workbench.textButton} onClick={onDismiss} aria-label={`Dismiss ${alias}`}>
              Dismiss
            </button>
          </form>
        ) : (
          <button type="button" className={workbench.textButton} onClick={onDismiss} aria-label={`Dismiss ${alias}`}>
            Dismiss
          </button>
        )}
      </div>
    </li>
  );
}
