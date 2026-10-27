import { Link } from 'react-router';
import styles from './SiteHeader.module.css';

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <Link to="/" className={styles.wordmark}>
        Seasonal Emote Replacer
      </Link>
      <nav className={styles.nav} aria-label="Main">
        <a href="/#how">How it works</a>
        <Link to="/guide/token">Token guide</Link>
        <Link to="/compare">Compare sets</Link>
      </nav>
    </header>
  );
}
