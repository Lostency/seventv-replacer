import { Link } from 'react-router';
import page from '../Landing.module.css';
import styles from './sections.module.css';

const STEPS = [
  {
    key: 'Token',
    title: 'Grab your 7TV token',
    body: (
      <>
        7TV doesn’t let other tools sign you in, so you copy a token from your browser once.{' '}
        <Link to="/guide/token">The token guide</Link> shows exactly where it is.
      </>
    ),
  },
  {
    key: 'Set',
    title: 'Pick your set',
    body: 'Type your channel and choose a set, or paste a set link. Sets an editor made for you work too.',
  },
  {
    key: 'Press',
    title: 'Preview, then press',
    body: 'Every swap shows up side by side first. Untick anything you’d rather keep, then press the key.',
  },
];

export function HowItWorks() {
  return (
    <section id="how" className={page.section} aria-labelledby="how-heading">
      <h2 id="how-heading" className={page.sectionHeading}>
        How it works
      </h2>
      <ol className={styles.steps}>
        {STEPS.map((step, i) => (
          <li key={step.key} className={styles.step}>
            <span className={styles.stepCap} aria-hidden="true">
              <span className={styles.stepNumber}>{i + 1}</span>
              {step.key}
            </span>
            <h3 className={styles.stepTitle}>{step.title}</h3>
            <p className={styles.stepBody}>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
