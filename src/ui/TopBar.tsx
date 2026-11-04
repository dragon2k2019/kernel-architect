import type { Sim } from '../game/sim';
import { cn } from '../utils/cn';

const SPEEDS = [1, 2, 4];
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function mood(h: number) {
  return h > 70 ? '😀' : h > 40 ? '😐' : h > 20 ? '😟' : '😱';
}

interface Props {
  sim: Sim;
  speed: number;
  showLog: boolean;
  goHint: boolean;
  onSpeed: (s: number) => void;
  onToggleLog: () => void;
  onBack: () => void;
  onGo: () => void;
}

export function TopBar({ sim, speed, showLog, goHint, onSpeed, onToggleLog, onBack, onGo }: Props) {
  const goal = sim.level.goal;
  const pct = goal ? Math.min(100, (sim.ok / goal) * 100) : 0;
  const running = sim.status === 'running';
  const hp = sim.happy;
  return (
    <div className="flex items-center gap-3 border-b border-line bg-panel/90 px-3 py-2 sm:gap-5 sm:px-4">
      <button onClick={onBack} className="rounded-lg px-2 py-1 text-lg text-dim hover:bg-panel2 hover:text-fg" title="Back to menu">←</button>
      <div className="hidden min-w-0 shrink-0 sm:block">
        <div className="text-[10px] uppercase tracking-widest text-dim">level {sim.level.n}</div>
        <div className="max-w-[180px] truncate text-sm font-bold">{sim.level.emoji} {sim.level.name}</div>
      </div>

      {/* goal */}
      <div className="min-w-[110px] flex-1">
        {goal ? (
          <>
            <div className="flex items-baseline justify-between text-xs">
              <span>👤 visitors served</span>
              <b className="text-ok">{sim.ok}<span className="text-dim"> / {goal}</span></b>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-ink">
              <div className="h-full rounded-full bg-gradient-to-r from-blue to-ok transition-[width] duration-200" style={{ width: `${pct}%` }} />
            </div>
          </>
        ) : (
          <div className="flex items-baseline gap-3 text-xs">
            <span>⏱ <b className="text-lg text-ok">{mmss(sim.t)}</b></span>
            <span className="text-dim">👤 {sim.ok} served</span>
          </div>
        )}
      </div>

      {/* mood */}
      <div className="w-[96px] shrink-0 sm:w-[140px]" title="Visitor happiness. Failures drain it. Zero = outage.">
        <div className="flex items-center justify-between text-xs">
          <span className="text-lg leading-none">{mood(hp)}</span>
          <span className="hidden text-dim sm:inline">happiness</span>
        </div>
        <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-ink">
          <div
            className={cn('h-full rounded-full transition-[width] duration-200', hp > 55 ? 'bg-ok' : hp > 25 ? 'bg-warn' : 'bg-bad animate-pulse')}
            style={{ width: `${hp}%` }}
          />
        </div>
      </div>

      {/* money */}
      <div className="shrink-0 text-right" title="Money. Earn it by serving visitors. Spend it on boxes.">
        <div className="text-[10px] uppercase tracking-widest text-dim">cash</div>
        <div className="text-lg font-bold leading-none text-warn">${Math.floor(sim.cash)}</div>
      </div>

      {/* controls */}
      <div className="hidden shrink-0 items-center gap-1 rounded-lg bg-ink p-1 md:flex">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeed(s)}
            className={cn('rounded-md px-2 py-1 text-xs font-bold', speed === s ? 'bg-blue text-ink' : 'text-dim hover:text-fg')}
          >
            {s}×
          </button>
        ))}
      </div>
      <button
        onClick={onToggleLog}
        className={cn('hidden shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-bold lg:block', showLog ? 'bg-panel2 text-ok' : 'text-dim hover:text-fg')}
        title="Toggle access log (L)"
      >
        &gt;_
      </button>
      <button
        onClick={onGo}
        disabled={sim.status === 'won' || sim.status === 'lost'}
        className={cn(
          'shrink-0 rounded-xl px-4 py-2 text-sm font-extrabold tracking-wide shadow-lg transition-transform active:scale-95',
          running ? 'bg-panel2 text-fg hover:bg-line' : 'bg-ok text-ink hover:brightness-110',
          goHint && !running && 'animate-ring',
        )}
        title="Space"
      >
        {running ? '⏸ PAUSE' : sim.status === 'paused' ? '▶ RESUME' : '▶ GO'}
      </button>
    </div>
  );
}
