import type { Sim } from '../game/sim';
import { PHASE_SECONDS, phaseInfo, rankFor } from '../game/content';
import { cn } from '../utils/cn';
import { Face, Icon, type Mood } from './icons';

const SPEEDS = [1, 2, 4];
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function moodFor(h: number): Mood {
  return h > 70 ? 'happy' : h > 40 ? 'sweat' : h > 20 ? 'hot' : 'dead';
}

interface Props {
  sim: Sim;
  speed: number;
  goHint: boolean;
  onSpeed: (s: number) => void;
  onGo: () => void;
}

/** The run toolbar: Run/Pause, speed, goal progress, happiness, wallet. */
export function TopBar({ sim, speed, goHint, onSpeed, onGo }: Props) {
  const goal = sim.level.goal;
  const pct = goal ? Math.min(100, (sim.ok / goal) * 100) : 0;
  const running = sim.status === 'running';
  const over = sim.status === 'won' || sim.status === 'lost';
  const hp = sim.happy;
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-line bg-panel px-3 py-2 sm:gap-4">
      <button
        onClick={onGo}
        disabled={over}
        data-tut="go"
        title="Space"
        className={cn(
          'flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-black tracking-wide transition-all active:translate-y-[2px]',
          running
            ? 'bg-panel2 text-fg shadow-[0_3px_0_#0c0d16] hover:bg-line'
            : 'bg-ok text-ink shadow-[0_3px_0_#3f9e4c] hover:brightness-110',
          goHint && !running && 'animate-glow',
        )}
      >
        <Icon name={running ? 'pause' : 'play'} size={16} strokeWidth={2.4} />
        {running ? 'PAUSE' : sim.status === 'paused' ? 'RESUME' : 'RUN'}
      </button>

      <div className="hidden shrink-0 items-center gap-0.5 rounded-lg bg-ink p-1 md:flex">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeed(s)}
            className={cn('rounded-md px-2 py-1 text-[11px] font-bold', speed === s ? 'bg-blue text-ink' : 'text-dim hover:text-fg')}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* goal */}
      <div data-tut="goal" className="min-w-[100px] flex-1">
        {goal ? (
          <>
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-dim"><Icon name="user" size={13} className="text-ok" /> visitors served</span>
              <b className="text-ok">{sim.ok}<span className="text-dim"> / {goal}</span></b>
            </div>
            <div className="relative mt-1 h-3 overflow-hidden rounded-full bg-ink">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue via-cyan to-ok transition-[width] duration-200"
                style={{ width: `${pct}%` }}
              />
              {[25, 50, 75].map((m) => <span key={m} className="absolute top-0 h-full w-px bg-ink/80" style={{ left: `${m}%` }} />)}
            </div>
          </>
        ) : (
          <div>
            <div className="flex items-baseline gap-3 text-[11px]">
              <span className="flex items-center gap-1.5 text-dim"><Icon name="clock" size={13} className="text-ok" /><b className="text-lg text-ok">{mmss(sim.t)}</b></span>
              <span className="text-dim">{sim.ok} served</span>
              <b className="truncate text-gold" title={`Rank: ${rankFor(sim.cleared)}`}>PHASE {sim.phase}<span className="hidden text-dim sm:inline"> · {phaseInfo(sim.phase).name}</span></b>
              {sim.flushing && <b className="animate-pulse text-bad">COLD CACHE</b>}
            </div>
            <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-ink" title="Time until this phase is cleared">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold/70 to-gold transition-[width] duration-200"
                style={{ width: `${((sim.t % PHASE_SECONDS) / PHASE_SECONDS) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* happiness */}
      <div data-tut="happy" className="w-[88px] shrink-0 sm:w-[132px]" title="Visitor happiness. Failures drain it. Zero = outage.">
        <div className="flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1.5 text-dim"><Face mood={moodFor(hp)} size={14} /><span className="hidden sm:inline">happiness</span></span>
          <b className={hp > 55 ? 'text-ok' : hp > 25 ? 'text-warn' : 'text-bad'}>{Math.round(hp)}</b>
        </div>
        <div className="mt-1 h-3 overflow-hidden rounded-full bg-ink">
          <div
            className={cn('h-full rounded-full transition-[width] duration-200', hp > 55 ? 'bg-ok' : hp > 25 ? 'bg-warn' : 'animate-pulse bg-bad')}
            style={{ width: `${hp}%` }}
          />
        </div>
      </div>

      {/* wallet */}
      <div
        id="wallet"
        data-tut="wallet"
        className="flex shrink-0 items-center gap-1.5 rounded-xl border border-gold/30 bg-gold/10 px-3 py-1.5"
        title="Cash. Earn it by serving visitors. Spend it on boxes."
      >
        <Icon name="coin" size={18} className="text-gold" />
        <b className="text-lg leading-none text-gold">${Math.floor(sim.cash)}</b>
      </div>
    </div>
  );
}
