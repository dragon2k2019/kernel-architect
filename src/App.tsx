import { useState } from 'react';
import { LEVELS, type Level } from './game/content';
import type { Sim } from './game/sim';
import { loadProgress, saveProgress, type Progress } from './game/store';
import { Title } from './ui/Title';
import { Play } from './ui/Play';

type Screen = { name: 'title' } | { name: 'level'; level: Level; attempt: number };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'title' });
  const [progress, setProgress] = useState<Progress>(loadProgress);

  const finish = (sim: Sim) => {
    setProgress((prev) => {
      const next: Progress = { stars: { ...prev.stars }, best: prev.best };
      if (sim.level.endless) next.best = Math.max(prev.best, sim.ok);
      else if (sim.status === 'won') next.stars[sim.level.id] = Math.max(prev.stars[sim.level.id] ?? 0, sim.stars);
      saveProgress(next);
      return next;
    });
  };

  if (screen.name === 'title') {
    return <Title progress={progress} onPlay={(level) => setScreen({ name: 'level', level, attempt: 0 })} />;
  }

  const { level, attempt } = screen;
  const nextLevel = LEVELS[level.n];
  return (
    <Play
      key={`${level.id}-${attempt}`}
      level={level}
      best={progress.best}
      hasNext={!!nextLevel}
      onFinish={finish}
      onNext={() => nextLevel && setScreen({ name: 'level', level: nextLevel, attempt: 0 })}
      onRetry={() => setScreen({ name: 'level', level, attempt: attempt + 1 })}
      onMenu={() => setScreen({ name: 'title' })}
    />
  );
}
