import { useEffect, useState } from 'react';
import { LEVELS, type Level } from './game/content';
import type { Sim } from './game/sim';
import { loadProgress, payout, saveProgress, type Progress } from './game/store';
import { sfx } from './game/sfx';
import { Title } from './ui/Title';
import { Play } from './ui/Play';
import { Tutorial } from './ui/Tutorial';
import { FxLayer } from './ui/FxLayer';

type Screen = { name: 'title' } | { name: 'level'; level: Level; attempt: number };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'title' });
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [tutorial, setTutorial] = useState<null | { then?: Level }>(null);

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

  const start = (level: Level) => {
    if (!progress.seenTutorial) { setTutorial({ then: level }); return; }
    setScreen({ name: 'level', level, attempt: 0 });
  };

  const closeTutorial = () => {
    const then = tutorial?.then;
    setTutorial(null);
    if (!progress.seenTutorial) update((p) => ({ ...p, seenTutorial: true }));
    if (then) setScreen({ name: 'level', level: then, attempt: 0 });
  };

  let body;
  if (screen.name === 'title') {
    body = <Title progress={progress} onPlay={start} onHelp={() => setTutorial({})} />;
  } else {
    const { level, attempt } = screen;
    const nextLevel = LEVELS[level.n];
    body = (
      <Play
        key={`${level.id}-${attempt}`}
        level={level}
        best={progress.best}
        bank={progress.bank}
        hasNext={!!nextLevel}
        onFinish={finish}
        onNext={() => nextLevel && setScreen({ name: 'level', level: nextLevel, attempt: 0 })}
        onRetry={() => setScreen({ name: 'level', level, attempt: attempt + 1 })}
        onMenu={() => setScreen({ name: 'title' })}
        onHelp={() => setTutorial({})}
      />
    );
  }

  return (
    <>
      {body}
      {tutorial && <Tutorial onClose={closeTutorial} />}
      <FxLayer />
    </>
  );
}
