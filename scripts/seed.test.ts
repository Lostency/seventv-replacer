import { describe, expect, it } from 'vitest';
import { buildSeedSql } from './seed';

const A = 'A'.repeat(26);
const B = 'B'.repeat(26);
const C = 'C'.repeat(26);
const D = 'D'.repeat(26);

describe('buildSeedSql', () => {
  const sql = buildSeedSql([
    {
      season: 'halloween',
      mappings: [
        { originalId: A, replacementId: B },
        { originalId: A, replacementId: C }, // duplicate original: last wins
        { originalId: D, replacementId: D }, // self-mapping: dropped
      ],
    },
  ]);

  it('keeps the last mapping per original', () => {
    expect(sql).toContain(`'${C}'`);
    expect(sql).not.toContain(`'${B}'`);
  });
  it('drops self-mappings', () => expect(sql).not.toContain(`'${D}'`));
  it('is idempotent', () => expect(sql).toContain('ON CONFLICT (season, original_id) DO NOTHING'));
  it('marks rows as seed data', () => expect(sql).toContain(`'seed_halloween_${A}', 'halloween', '${A}', '${C}', 'seed'`));
  it('emits no INSERT for a season without mappings', () => {
    expect(buildSeedSql([{ season: 'winter', mappings: [] }])).not.toContain('INSERT');
  });
  it('rejects malformed ids', () => {
    expect(() =>
      buildSeedSql([
        { season: 'winter', mappings: [{ originalId: "x'); DROP TABLE mappings;--", replacementId: B }] },
      ]),
    ).toThrow();
  });
});
