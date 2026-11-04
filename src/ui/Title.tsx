import { LEVELS, type Level } from '../game/content';
import type { Progress } from '../game/store';
import { cn } from '../utils/cn';

export function isUnlocked(l: Level, p: Progress): boolean {
  if (l.n === 1) return true;
  const prev = LEVELS[l.n - 2];
  return (p.stars[prev.id] ?? 0) >= 1;
}

function Pipe({ delay = 0 }: { delay?: number }) {
  return (
    <div className="relative h-[3px] w-8 overflow-hidden rounded bg-line sm:w-16">
      {[0, 1.1].map((d) => (
        <span
          key={d}
          className="absolute -top-[2px] left-0 h-[7px] w-[7px] animate-drift rounded-full bg-cyan shadow-[0_0_8px_#7dcfff]"
          style={{ animationDelay: `${delay + d}s` }}
        />
      ))}
    </div>
  );
}

function Box({ icon, color }: { icon: string; color: string }) {
  return (
    <div
      className="flex h-12 w-12 items-center justify-center rounded-xl border-2 bg-panel text-2xl sm:h-16 sm:w-16 sm:text-3xl"
      style={{ borderColor: color + 'aa', boxShadow: `0 0 24px ${color}33` }}
    >
      {icon}
    </div>
  );
}

export function Title({ progress, onPlay }: { progress: Progress; onPlay: (l: Level) => void }) {
  const next = LEVELS.find((l) => isUnlocked(l, progress) && (progress.stars[l.id] ?? 0) === 0) ?? LEVELS[LEVELS.length - 1];
  const started = Object.keys(progress.stars).length > 0;
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-y-auto bg-ink px-4 py-8">
      <div className="pointer-events-none absolute inset-0 board-bg opacity-60" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue/10 blur-3xl" />

      <div className="relative flex w-full max-w-2xl flex-col items-center text-center">
        {/* animated mini-pipeline */}
        <div className="mb-8 flex items-center gap-1.5 sm:gap-2" aria-hidden>
          <Box icon="🌐" color="#7dcfff" />
          <Pipe />
          <Box icon="⚖️" color="#bb9af7" />
          <Pipe delay={0.4} />
          <div className="flex flex-col gap-1">
            <Box icon="🖥️" color="#9ece6a" />
          </div>
          <Pipe delay={0.8} />
          <Box icon="🗄️" color="#e0af68" />
        </div>

        <div className="text-[11px] uppercase tracking-[0.5em] text-dim">kernel</div>
        <h1 className="mt-1 text-5xl font-black tracking-tight sm:text-7xl">
          <span className="bg-gradient-to-r from-cyan via-blue to-violet bg-clip-text text-transparent">ARCHITECT</span>
          <span className="animate-blink text-ok">_</span>
        </h1>
        <p className="mt-4 text-lg text-fg sm:text-xl">Keep the internet from melting.</p>

        {/* how to play, in three pictures */}
        <div className="mt-8 flex items-center gap-2 text-sm sm:gap-4">
          {[
            ['🖱️', 'Drag a box'],
            ['🔌', 'Wire it up'],
            ['▶️', 'Survive'],
          ].map(([i, t], idx) => (
            <div key={t} className="flex items-center gap-2 sm:gap-4">
              {idx > 0 && <span className="text-dim">→</span>}
              <div className="flex flex-col items-center gap-1 rounded-xl bg-panel/80 px-3 py-2.5 sm:px-5">
                <span className="text-2xl">{i}</span>
                <span className="text-[11px] font-bold sm:text-xs">{t}</span>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={() => onPlay(next)}
          className="mt-9 rounded-2xl bg-ok px-12 py-4 text-xl font-black tracking-wide text-ink shadow-[0_0_40px_rgba(158,206,106,0.35)] transition-transform hover:scale-105 hover:brightness-110 active:scale-95"
        >
          ▶ {started ? 'CONTINUE' : 'PLAY'}
        </button>

        {/* level path */}
        <div className="mt-10 flex flex-wrap items-start justify-center gap-2.5 sm:gap-3">
          {LEVELS.map((l) => {
            const open = isUnlocked(l, progress);
            const s = progress.stars[l.id] ?? 0;
            return (
              <button
                key={l.id}
                disabled={!open}
                onClick={() => onPlay(l)}
                title={open ? l.name : 'Beat the previous level'}
                className={cn(
                  'group flex w-[64px] flex-col items-center gap-1 rounded-xl border bg-panel/80 px-1 py-2 transition-all sm:w-[72px]',
                  open ? 'border-line hover:-translate-y-1 hover:border-blue' : 'cursor-not-allowed border-line/40 opacity-40',
                  l.id === next.id && 'border-ok',
                )}
              >
                <span className="text-2xl">{open ? l.emoji : '🔒'}</span>
                <span className="text-[10px] text-dim">{l.endless ? '∞' : l.n}</span>
                <span className="h-3 text-[11px] leading-none tracking-tighter text-warn">
                  {l.endless ? (progress.best ? `${progress.best}` : '') : '★'.repeat(s) + '☆'.repeat(open ? 3 - s : 0)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-8 text-[11px] text-dim">
          <span className="text-ok">$</span> drag · connect · don't get paged at 3am
        </div>
      </div>
    </div>
  );
}
