import { useEffect, useRef, useState } from 'react';
import { currentSeason, seasonLabel, type SeasonId } from '@shared/seasons';
import type { MappingRow, StatsResponse } from '@shared/types';
import { fetchPreset, fetchStats } from '../../api';

export const DECK_SIZE = 24;
const FLIP_INTERVAL_MS = 60;
const AUTO_TURN_MS = 800;

export type Dial = 'normal' | SeasonId;

type Loaded<T> = T | 'loading' | 'failed';

export interface DeckKey {
  emoteId?: string;
  flipped: boolean;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The landing deck: which season the knob points at, the preset whose emotes
 * sit on the keys, and how far the flip to seasonal art has travelled.
 */
export function useDeck() {
  const [reducedMotion] = useState(prefersReducedMotion);
  const [dial, setDialState] = useState<Dial>('normal');
  const [deckSeason, setDeckSeason] = useState<SeasonId>(() => currentSeason(new Date()));
  const [presets, setPresets] = useState<Partial<Record<SeasonId, Loaded<MappingRow[]>>>>({});
  const [stats, setStats] = useState<Loaded<StatsResponse>>('loading');
  const [flipped, setFlipped] = useState(0);
  const touched = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchStats(controller.signal).then(setStats, () => {
      if (!controller.signal.aborted) setStats('failed');
    });
    return () => controller.abort();
  }, []);

  const preset = presets[deckSeason];
  useEffect(() => {
    if (preset !== undefined) return;
    setPresets((p) => ({ ...p, [deckSeason]: 'loading' }));
    fetchPreset(deckSeason).then(
      (body) => setPresets((p) => ({ ...p, [deckSeason]: body.mappings })),
      () => setPresets((p) => ({ ...p, [deckSeason]: 'failed' })),
    );
  }, [deckSeason, preset]);

  const ready = Array.isArray(preset);

  // Turn once, on our own, to today's season, so a first-time visitor sees the swap happen.
  useEffect(() => {
    if (!ready || reducedMotion || touched.current) return;
    const timer = setTimeout(() => {
      if (!touched.current) setDialState(deckSeason);
    }, AUTO_TURN_MS);
    return () => clearTimeout(timer);
  }, [ready, reducedMotion, deckSeason]);

  const target = dial === 'normal' || !ready ? 0 : DECK_SIZE;
  useEffect(() => {
    if (flipped === target) return;
    if (reducedMotion) {
      setFlipped(target);
      return;
    }
    const timer = setTimeout(() => setFlipped((f) => f + Math.sign(target - f)), FLIP_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [flipped, target, reducedMotion]);

  const setDial = (next: Dial) => {
    touched.current = true;
    if (next !== 'normal' && next !== deckSeason) {
      setDeckSeason(next);
      setFlipped(0);
    }
    setDialState(next);
  };

  const keys: DeckKey[] = Array.from({ length: DECK_SIZE }, (_, i) => {
    const mapping = ready ? preset[i] : undefined;
    const isFlipped = i < flipped;
    return { emoteId: isFlipped ? mapping?.replacementId : mapping?.originalId, flipped: isFlipped && !!mapping };
  });

  const readout = (() => {
    if (dial === 'normal') return 'Turn the knob';
    const label = seasonLabel(dial);
    if (ready && flipped < DECK_SIZE) return `${label} · ${flipped}/${DECK_SIZE}`;
    if (typeof stats === 'object') return `${label} · ${stats.mappings[dial]} mappings`;
    return label;
  })();

  return {
    dial,
    setDial,
    /** The season a submit should carry: the knob's, or the one the keys are showing. */
    season: dial === 'normal' ? deckSeason : dial,
    keys,
    presetFailed: preset === 'failed',
    readout,
    stats: typeof stats === 'object' ? stats : null,
  };
}
