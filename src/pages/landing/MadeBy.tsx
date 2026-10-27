import page from '../Landing.module.css';
import styles from './sections.module.css';

export function MadeBy() {
  return (
    <section className={`${page.section} ${styles.madeBy}`} aria-label="Who made this">
      <p className={styles.madeByText}>
        Built by <a href="https://twitch.tv/niena">niena</a>. Come say hi on Twitch.
      </p>
    </section>
  );
}
