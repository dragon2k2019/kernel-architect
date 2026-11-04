// Tiny localStorage save: stars per level, best endless score, lifetime wallet, tutorial flag.
import type { Sim } from './sim';

export interface Progress { stars: Record<string, number>; best: number; bank: number; seenTutorial: boolean }

const KEY = 'kernel-architect.v3';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem('kernel-architect.v2');
    if (raw) {
      const p = JSON.parse(raw);
      return { stars: p.stars ?? {}, best: p.best ?? 0, bank: p.bank ?? 0, seenTutorial: !!p.seenTutorial };
    }
  } catch { /* ignore */ }
  return { stars: {}, best: 0, bank: 0, seenTutorial: false };
}

export function saveProgress(p: Progress) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export const STAR_BONUS = 100;

/** Cash paid out when a run ends: revenue earned while serving plus a bonus per star. */
export function payout(sim: Sim): { revenue: number; bonus: number; total: number } {
  const revenue = Math.round(sim.earned);
  const bonus = sim.status === 'won' && !sim.level.endless ? sim.stars * STAR_BONUS : 0;
  return { revenue, bonus, total: revenue + bonus };
}
