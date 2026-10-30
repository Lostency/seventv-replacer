import { useCallback, useEffect, useState } from 'react';
import type { SeasonId } from '@shared/seasons';
import type { AdminMapping, BrokenEmote } from '@shared/types';
import { fetchAdminMappings, fetchBroken } from '../../api';

type Loaded<T> = T | 'loading' | 'failed';

const byOriginalId = (a: AdminMapping, b: AdminMapping) =>
  a.originalId < b.originalId ? -1 : a.originalId > b.originalId ? 1 : 0;

/** Now in SQLite's datetime('now') form, which created_at holds. */
const sqlNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

/**
 * The season's preset and its broken-emote reports, read once per season and `version`. Each read costs
 * D1 a row per mapping, so a write the page made itself is applied here instead of reading both again.
 */
export function usePreset(season: SeasonId, version: number, enabled: boolean) {
  const [mappings, setMappings] = useState<Loaded<AdminMapping[]>>('loading');
  const [broken, setBroken] = useState<Loaded<BrokenEmote[]>>('loading');

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    fetchAdminMappings(season).then(
      (body) => current && setMappings(body.mappings),
      () => current && setMappings('failed'),
    );
    fetchBroken(season).then(
      (body) => current && setBroken(body.broken),
      () => current && setBroken('failed'),
    );
    return () => {
      current = false;
    };
  }, [season, version, enabled]);

  /** `originalId` now maps to `replacementId`: its row changes, and a report on the old pairing no longer applies. */
  const mapped = useCallback((originalId: string, replacementId: string, source: AdminMapping['source']) => {
    setMappings((list) => {
      if (!Array.isArray(list)) return list;
      const old = list.find((m) => m.originalId === originalId);
      const row: AdminMapping = { originalId, replacementId, source, createdAt: old?.createdAt ?? sqlNow() };
      return [...list.filter((m) => m !== old), row].sort(byOriginalId);
    });
    setBroken((list) =>
      Array.isArray(list) ? list.filter((b) => b.originalId !== originalId || b.replacementId === replacementId) : list,
    );
  }, []);

  const dismissed = useCallback((row: BrokenEmote) => {
    setBroken((list) => (Array.isArray(list) ? list.filter((b) => b.originalId !== row.originalId) : list));
  }, []);

  return { mappings, broken, mapped, dismissed };
}
