import { Link } from 'react-router';
import { SEASONS, seasonLabel } from '@shared/seasons';
import type { StatsResponse } from '@shared/types';
import page from '../Landing.module.css';
import styles from './sections.module.css';

const TICK_EVERY = 50;

/** One tick per 50 mappings, lit up to the season's live count: the readout's scale. */
function Scale({ value, max }: { value: number; max: number }) {
  const ticks = Math.max(1, Math.ceil(max / TICK_EVERY));
  return (
    <span className={styles.scale} aria-hidden="true">
      {Array.from({ length: ticks }, (_, i) => (
        <span key={i} className={styles.tick} data-lit={i * TICK_EVERY < value || undefined} />
      ))}
    </span>
  );
}

export function BuiltFromRealSets({ stats }: { stats: StatsResponse | null }) {
  const max = stats ? Math.max(...SEASONS.map((s) => stats.mappings[s])) : 0;
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
          <div className={styles.readoutBezel}>
            <dl className={styles.readout}>
              <span className={styles.readoutLegend} aria-hidden="true">
                Preset size · live
              </span>
              {SEASONS.map((season) => (
                <div key={season} className={styles.readoutRow}>
                  <dt>{seasonLabel(season)}</dt>
                  <dd>
                    {stats.mappings[season].toLocaleString('en')}
                    <span className={styles.readoutUnit}> mappings</span>
                  </dd>
                  <Scale value={stats.mappings[season]} max={max} />
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </section>
  );
}
