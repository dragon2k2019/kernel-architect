import { useEffect, useState } from 'react';
import { LEVELS, type Level } from './game/content';
import type { Sim } from './game/sim';
import { loadProgress, payout, saveProgress, type Progress } from './game/store';
import { sfx } from './game/sfx';
import { Title } from './ui/Title';
import { Play } from './ui/Play';
import { TUTORIALS } from './game/tutorial';
import { FxLayer } from './ui/FxLayer';
import { MySpecBadge } from './ui/MySpecBadge';

type Screen = { name: 'title' } | { name: 'level'; level: Level; attempt: number; tutorial: boolean };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'title' });
  const [progress, setProgress] = useState<Progress>(loadProgress);

  // Browsers only allow audio after a gesture.
  useEffect(() => {
    const unlock = () => sfx.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);

  const update = (fn: (p: Progress) => Progress) =>
    setProgress((prev) => { const next = fn(prev); saveProgress(next); return next; });

  const finish = (sim: Sim) => {
    const pay = payout(sim);
    update((prev) => {
      const next: Progress = { ...prev, stars: { ...prev.stars }, bank: prev.bank + pay.total };
      if (sim.level.endless) next.best = Math.max(prev.best, sim.ok);
      else if (sim.status === 'won') next.stars[sim.level.id] = Math.max(prev.stars[sim.level.id] ?? 0, sim.stars);
      return next;
    });
  };

  // The hands-on tutorial plays inside the level, the first time you open it (or when replayed from the menu).
  const open = (level: Level, force = false) =>
    setScreen({ name: 'level', level, attempt: 0, tutorial: !!TUTORIALS[level.id] && (force || !progress.tuts[level.id]) });

  const tutDone = (id: string) => update((p) => (p.tuts[id] ? p : { ...p, tuts: { ...p.tuts, [id]: true } }));

  let body;
  if (screen.name === 'title') {
    body = <Title progress={progress} onPlay={(l) => open(l)} onHelp={() => open(LEVELS[0], true)} />;
  } else {
    const { level, attempt, tutorial } = screen;
    const nextLevel = LEVELS[level.n];
    body = (
      <Play
        key={`${level.id}-${attempt}`}
        level={level}
        best={progress.best}
        bank={progress.bank}
        hasNext={!!nextLevel}
        onFinish={finish}
        onNext={() => nextLevel && open(nextLevel)}
        onRetry={() => setScreen({ name: 'level', level, attempt: attempt + 1, tutorial: false })}
        onMenu={() => setScreen({ name: 'title' })}
        tutorial={tutorial}
        onTutDone={() => tutDone(level.id)}
      />
    );
  }

  return (
    <>
      {body}
      <FxLayer />
      <MySpecBadge />
    </>
  );
}
