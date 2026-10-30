import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { seasonLabel, type SeasonId } from '@shared/seasons';
import type { AdminMapping, PresetFile } from '@shared/types';
import { deleteMapping } from '../../api';
import { GunmetalKey } from '../../design/GunmetalKey';
import { Keycap } from '../../design/Keycap';
import workbench from '../Workbench.module.css';
import styles from './review.module.css';

interface MappingsProps {
  season: SeasonId;
  mappings: AdminMapping[] | 'loading' | 'failed';
  /** Called after a mapping was deleted, with the row as it was. */
  onDeleted(deleted: AdminMapping | null): void;
  onProblem(message: string): void;
}

/** The preset as data/presets/<season>.json holds it, so a download can be committed as is. */
function presetJson(season: SeasonId, mappings: AdminMapping[]): string {
  const file: PresetFile = {
    season,
    mappings: mappings
      .map(({ originalId, replacementId }) => ({ originalId, replacementId }))
      .sort((a, b) => (a.originalId < b.originalId ? -1 : a.originalId > b.originalId ? 1 : 0)),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Every mapping in the season's preset, each deletable, and the whole preset as a file. */
export function Mappings({ season, mappings, onDeleted, onProblem }: MappingsProps) {
  const [busy, setBusy] = useState<string | null>(null);

  const remove = async (originalId: string) => {
    setBusy(originalId);
    try {
      onDeleted((await deleteMapping(season, originalId)).deleted);
    } catch (error) {
      onProblem(error instanceof Error ? error.message : 'The mapping wasn’t deleted. Try again.');
    } finally {
      setBusy(null);
    }
  };

  if (mappings === 'loading') return <p className={workbench.stepLede}>Loading the preset…</p>;
  if (mappings === 'failed') {
    return (
      <p className={workbench.plate} role="alert">
        The preset didn’t load. Reload the page to try again.
      </p>
    );
  }

  return (
    <div className={styles.mappings}>
      <div className={styles.mappingsHead}>
        <h3 className={styles.mappingsTitle}>
          {seasonLabel(season)} preset · {mappings.length} {mappings.length === 1 ? 'mapping' : 'mappings'}
        </h3>
        <GunmetalKey size="small" onClick={() => download(`${season}.json`, presetJson(season, mappings))}>
          Download JSON
        </GunmetalKey>
      </div>
      <ul className={styles.mappingList} aria-label={`${seasonLabel(season)} mappings`}>
        {mappings.map((m) => (
          <li key={m.originalId} className={styles.mappingRow}>
            <div className={styles.pair}>
              <Keycap emoteId={m.originalId} alt="Normal" />
              <ArrowRight className={styles.arrow} size={18} strokeWidth={2.5} aria-hidden="true" />
              <Keycap emoteId={m.replacementId} alt="Seasonal" tone="putty" />
            </div>
            <button
              type="button"
              className={styles.delete}
              aria-label={`Delete ${m.originalId}`}
              aria-disabled={busy === m.originalId || undefined}
              onClick={() => busy !== m.originalId && void remove(m.originalId)}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
