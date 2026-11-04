// Tiny localStorage save: stars per level + best endless score.
export interface Progress { stars: Record<string, number>; best: number }

const KEY = 'kernel-architect.v2';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { stars: p.stars ?? {}, best: p.best ?? 0 };
    }
  } catch { /* ignore */ }
  return { stars: {}, best: 0 };
}

export function saveProgress(p: Progress) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
