import { Link } from 'react-router';
import styles from './SiteFooter.module.css';

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <p className={styles.name}>Seasonal Emote Replacer</p>
      <nav className={styles.links} aria-label="Footer">
        <Link to="/">Home</Link>
        <Link to="/guide/token">Token guide</Link>
        <a href="https://twitch.tv/niena">Made by niena</a>
        <a href="https://github.com/Lostency/seventv-replacer">Source on GitHub</a>
      </nav>
      <p className={styles.note}>Not affiliated with 7TV.</p>
    </footer>
  );
}
