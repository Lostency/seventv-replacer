import { readFileSync, writeFileSync } from 'node:fs';
import { isSeasonId, SEASONS } from '../shared/seasons';
import type { PresetFile } from '../shared/types';
import { buildSeedSql } from './seed';

const presets = SEASONS.map((season): PresetFile => {
  const file = JSON.parse(readFileSync(`data/presets/${season}.json`, 'utf8')) as PresetFile;
  if (!isSeasonId(file.season) || file.season !== season) {
    throw new Error(`data/presets/${season}.json declares season ${JSON.stringify(file.season)}`);
  }
  return file;
});

const sql = buildSeedSql(presets);
writeFileSync('migrations/0002_seed.sql', sql);
for (const line of sql.split('\n').filter((l) => /^-- \w+: \d+ mappings$/.test(l))) {
  console.log(line.slice(3).replace(' mappings', ''));
}
