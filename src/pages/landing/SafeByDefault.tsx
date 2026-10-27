import page from '../Landing.module.css';
import styles from './sections.module.css';

const SPECS = [
  {
    label: 'Default mode',
    value: 'Copy first',
    body: 'The seasonal emotes go into a new set, so your normal set is never touched unless you choose otherwise.',
  },
  {
    label: 'Before a run',
    value: 'Full preview',
    body: 'Every emote sits next to its seasonal version, ticked, before anything is sent to 7TV.',
  },
  {
    label: 'After a run',
    value: 'Exact undo',
    body: 'Your last 10 runs can be undone from this browser, swap for swap, back to how the set was.',
  },
  {
    label: 'Your token',
    value: 'Stays with you',
    body: 'It is kept in your browser and only ever sent to 7TV. This site’s server never sees it.',
  },
];

export function SafeByDefault() {
  return (
    <section className={page.section} aria-labelledby="safe-heading">
      <h2 id="safe-heading" className={page.sectionHeading}>
        Your set stays safe
      </h2>
      <dl className={styles.plate}>
        {SPECS.map((spec) => (
          <div key={spec.label} className={styles.plateRow}>
            <dt className={styles.plateLabel}>{spec.label}</dt>
            <dd className={styles.plateValue}>
              <strong>{spec.value}</strong>
              <span>{spec.body}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
