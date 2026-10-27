import { Link } from 'react-router';
import { AmberScreen } from '../design/AmberScreen';
import { SiteFooter } from '../design/SiteFooter';
import { SiteHeader } from '../design/SiteHeader';
import styles from './NotYet.module.css';

/** Placeholder for parts of the deck that ship in a later update. */
export function NotYet({ feature }: { feature: string }) {
  return (
    <>
      <SiteHeader />
      <main className={styles.main}>
        <AmberScreen>{feature} · not wired up yet</AmberScreen>
        <h1 className={styles.heading}>{feature} arrives in the next update.</h1>
        <p className={styles.body}>
          The landing page and the token guide are ready now. While you wait, you can{' '}
          <Link to="/guide/token">get your 7TV token</Link> so you’re set when {feature} goes live.
        </p>
        <Link to="/" className={styles.back}>
          Back to the deck
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
