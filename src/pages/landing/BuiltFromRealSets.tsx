import { Link } from 'react-router';
import { SEASONS, seasonLabel } from '@shared/seasons';
import type { StatsResponse } from '@shared/types';
import page from '../Landing.module.css';
import styles from './sections.module.css';

export function BuiltFromRealSets({ stats }: { stats: StatsResponse | null }) {
  return (
    <section className={page.section} aria-labelledby="real-heading">
      <div className={styles.real}>
        <div>
          <h2 id="real-heading" className={page.sectionHeading}>
            Learned from real channels
          </h2>
          <p className={page.lede}>
            The swaps come from streamers’ own normal and seasonal sets. When two different channels made the same
            swap, it goes up for review, and only reviewed swaps reach the presets.
          </p>
          <Link to="/compare" className={styles.compareLink}>
            Compare two of your sets
          </Link>
        </div>
        {stats && (
          <dl className={styles.counts}>
            {SEASONS.map((season) => (
              <div key={season} className={styles.count}>
                <dt>{seasonLabel(season)} mappings</dt>
                <dd>{stats.mappings[season].toLocaleString('en')}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
