import { Link } from 'react-router';
import page from '../Landing.module.css';
import styles from './sections.module.css';

const STEPS = [
  {
    title: 'Grab your 7TV token',
    body: (
      <>
        7TV doesn’t let other tools sign you in, so you copy a token from your browser once.{' '}
        <Link to="/guide/token">The token guide</Link> shows exactly where it is.
      </>
    ),
  },
  {
    title: 'Pick your set',
    body: 'Type your channel and choose a set, or paste a set link. Sets an editor made for you work too.',
  },
  {
    title: 'Preview, then press',
    body: 'Every swap shows up side by side first. Untick anything you’d rather keep, then press the key.',
  },
];

/** The three steps as the deck's function row: one strip, three keys, each step printed on its key. */
export function HowItWorks() {
  return (
    <section id="how" className={page.section} aria-labelledby="how-heading">
      <h2 id="how-heading" className={page.sectionHeading}>
        How it works
      </h2>
      <ol className={styles.functionRow}>
        {STEPS.map((step, i) => (
          <li key={step.title} className={styles.functionStep}>
            <div className={styles.functionKey}>
              <span className={styles.functionNumber} aria-hidden="true">
                {i + 1}
              </span>
              <h3 className={styles.functionTitle}>{step.title}</h3>
            </div>
            <p className={styles.functionBody}>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
