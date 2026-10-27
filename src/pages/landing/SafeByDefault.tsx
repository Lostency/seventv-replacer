import page from '../Landing.module.css';
import styles from './sections.module.css';

const SPECS = [
  {
    title: 'Copy first',
    body: 'By default the seasonal emotes go into a new set, so your normal set is never touched unless you choose otherwise.',
  },
  {
    title: 'Full preview',
    body: 'Every emote sits next to its seasonal version, ticked, before anything is sent to 7TV.',
  },
  {
    title: 'Undo, swap for swap',
    body: 'Your last 10 runs can be undone from this browser. Undo reverses each swap the run made and leaves alone any emote you’ve changed since.',
  },
  {
    title: 'Your token stays with you',
    body: 'It is kept in your browser and only ever sent to 7TV. This site’s server never sees it.',
  },
];

/** The spec plate screwed to the back of the deck. */
export function SafeByDefault() {
  return (
    <section className={page.section} aria-labelledby="safe-heading">
      <h2 id="safe-heading" className={page.sectionHeading}>
        Your set stays safe
      </h2>
      <ul className={styles.plate}>
        {SPECS.map((spec) => (
          <li key={spec.title} className={styles.plateRow}>
            <strong className={styles.plateTitle}>{spec.title}</strong>
            <span className={styles.plateBody}>{spec.body}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
