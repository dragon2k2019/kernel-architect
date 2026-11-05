// Tiny localStorage save: stars per level, best endless score, lifetime wallet, which level tutorials were finished.
import type { Sim } from './sim';
import { TUNING } from './content';

export interface Progress { stars: Record<string, number>; best: number; bank: number; tuts: Record<string, boolean> }

const KEY = 'kernel-architect.v3';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem('kernel-architect.v2');
    if (raw) {
      const p = JSON.parse(raw);
      // older saves only had one global flag: that meant "the old how-to-play was read", so treat it as L1 done
      return { stars: p.stars ?? {}, best: p.best ?? 0, bank: p.bank ?? 0, tuts: p.tuts ?? (p.seenTutorial ? { L1: true } : {}) };
    }
  } catch { /* ignore */ }
  return { stars: {}, best: 0, bank: 0, tuts: {} };
}

export function saveProgress(p: Progress) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export const STAR_BONUS = 100;

/** Cash paid out when a run ends: revenue earned while serving plus a bonus per star. */
export function payout(sim: Sim): { revenue: number; bonus: number; combo: number; total: number } {
  const revenue = Math.round(sim.earned);
  const bonus = sim.status === 'won' && !sim.level.endless ? sim.stars * STAR_BONUS : 0;
  const combo = sim.bestCombo >= TUNING.comboStep ? Math.min(sim.bestCombo, TUNING.comboPayCap) * TUNING.comboPay : 0;
  return { revenue, bonus, combo, total: revenue + bonus + combo };
}
