import { LEVELS, NODE_DEFS, type Kind, type Level } from '../game/content';
import type { Progress } from '../game/store';
import { sfx } from '../game/sfx';
import { cn } from '../utils/cn';
import { Btn, Dots, Tab } from './Chrome';
import { Icon, NodeIcon, type IconName } from './icons';
import { SoundToggle } from './SoundToggle';
import { MySpecBadge } from './MySpecBadge';

export function isUnlocked(l: Level, p: Progress): boolean {
  if (l.n === 1) return true;
  const prev = LEVELS[l.n - 2];
  return (p.stars[prev.id] ?? 0) >= 1;
}

const fileName = (l: Level) =>
  `${String(l.n).padStart(2, '0')}_${l.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}.arch`;

function Pipe({ delay = 0 }: { delay?: number }) {
  return (
    <div className="relative h-[3px] w-6 overflow-hidden rounded bg-line sm:w-14">
      {[0, 1.1].map((d) => (
        <span key={d} className="absolute -top-[2px] left-0 h-[7px] w-[7px] animate-drift rounded-full bg-cyan shadow-[0_0_8px_#5ee0ff]" style={{ animationDelay: `${delay + d}s` }} />
      ))}
    </div>
  );
}

function Box({ kind, delay = 0 }: { kind: Kind; delay?: number }) {
  const c = NODE_DEFS[kind].color;
  return (
    <div
      className="flex h-12 w-12 animate-bob items-center justify-center rounded-xl border-2 bg-panel sm:h-16 sm:w-16"
      style={{ borderColor: c + 'aa', boxShadow: `0 0 26px ${c}33`, animationDelay: `${delay}s` }}
    >
      <NodeIcon kind={kind} size={28} color={c} />
    </div>
  );
}

function Stars({ n, size = 12 }: { n: number; size?: number }) {
  return (
    <span className="flex gap-px">
      {[0, 1, 2].map((i) => <Icon key={i} name="star" size={size} className={i < n ? 'text-gold' : 'text-line'} />)}
    </span>
  );
}

export function Title({ progress, onPlay, onHelp }: { progress: Progress; onPlay: (l: Level) => void; onHelp: () => void }) {
  const next = LEVELS.find((l) => isUnlocked(l, progress) && (progress.stars[l.id] ?? 0) === 0) ?? LEVELS[LEVELS.length - 1];
  const started = Object.keys(progress.stars).length > 0;
  const totalStars = Object.values(progress.stars).reduce((a, b) => a + b, 0);
  const play = (l: Level) => { sfx.unlock(); sfx.go(); onPlay(l); };

  return (
    <div className="flex h-full flex-col bg-ink">
      {/* window title bar */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-ink2 px-3">
        <Dots />
        <div className="flex-1 truncate text-center text-[11px] text-dim">Welcome - kernel-architect - ~/projects</div>
        <div className="flex items-center gap-1" title="Your lifetime winnings">
          <Icon name="coin" size={15} className="text-gold" />
          <b className="text-[12px] text-gold">${progress.bank.toLocaleString()}</b>
        </div>
        <button onClick={onHelp} title="Replay the tutorial" className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-dim hover:bg-line hover:text-fg">
          <Icon name="help" size={15} /><span className="hidden sm:inline">Tutorial</span>
        </button>
        <SoundToggle />
      </div>

      <div className="flex min-h-0 flex-1">
        {/* explorer */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-ink2 md:flex">
          <div className="flex items-center gap-2 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-dim">
            <Icon name="folder" size={13} /> Levels
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {LEVELS.map((l) => {
              const open = isUnlocked(l, progress);
              const s = progress.stars[l.id] ?? 0;
              return (
                <button
                  key={l.id}
                  disabled={!open}
                  onClick={() => play(l)}
                  onPointerEnter={() => open && sfx.hover()}
                  className={cn(
                    'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors',
                    open ? 'text-fg hover:bg-panel2' : 'cursor-not-allowed text-dim/50',
                    l.id === next.id && open && 'bg-panel2 ring-1 ring-ok/50',
                  )}
                >
                  <Icon name={open ? l.icon : 'lock'} size={16} className={open ? 'text-cyan' : ''} />
                  <span className="min-w-0 flex-1 truncate">{fileName(l)}</span>
                  {l.endless ? (
                    <span className="text-[10px] text-gold">{progress.best ? `best ${progress.best}` : ''}</span>
                  ) : open ? <Stars n={s} size={11} /> : null}
                </button>
              );
            })}
          </div>
          <div className="border-t border-line px-4 py-3 text-[11px] text-dim">
            <div className="flex items-center justify-between"><span>stars</span><b className="text-gold">{totalStars} / {(LEVELS.length - 1) * 3}</b></div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full rounded-full bg-gold transition-all" style={{ width: `${(totalStars / ((LEVELS.length - 1) * 3)) * 100}%` }} /></div>
          </div>
        </aside>

        {/* welcome tab */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 border-b border-line bg-ink2"><Tab icon="rocket" label="Welcome.md" active color="#ffd34d" /></div>
          <div className="scroll-thin relative min-h-0 flex-1 overflow-y-auto">
            <div className="pointer-events-none absolute inset-0 board-bg opacity-70" />
            <div className="pointer-events-none absolute left-1/2 top-[22%] h-[420px] w-[760px] -translate-x-1/2 -translate-y-1/2" style={{ background: "radial-gradient(closest-side, rgba(183,148,255,0.14), transparent)" }} />
            <div className="relative mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center px-5 py-8 text-center">
              <div className="mb-7 flex items-center gap-1.5 sm:gap-2" aria-hidden>
                <Box kind="internet" />
                <Pipe />
                <Box kind="cache" delay={0.3} />
                <Pipe delay={0.4} />
                <Box kind="lb" delay={0.6} />
                <Pipe delay={0.8} />
                <Box kind="server" delay={0.9} />
                <Pipe delay={1.2} />
                <Box kind="db" delay={1.2} />
              </div>

              <div className="text-[11px] uppercase tracking-[0.5em] text-dim">kernel</div>
              <h1 className="mt-1 text-[40px] font-black leading-none tracking-tight sm:text-7xl">
                <span className="gold-text">ARCHITECT</span><span className="animate-blink text-ok">_</span>
              </h1>
              <p className="mt-4 text-lg font-bold text-fg sm:text-xl">Keep the internet from melting.</p>

              <div className="mt-5 w-full max-w-md overflow-hidden rounded-xl border border-line bg-ink/90 text-left text-[12px] leading-6 shadow-xl">
                <div className="flex items-center gap-1.5 border-b border-line bg-ink2 px-3 py-1.5 text-[10px] text-dim"><Icon name="terminal" size={12} /> bash</div>
                <div className="px-3.5 py-2.5">
                  <div><span className="text-ok">$</span> <span className="text-fg">./kernel-architect --play</span></div>
                  <div className="text-dim">visitors incoming. traffic is going up.</div>
                  <div><span className="text-cyan">goal:</span> <span className="text-fg">build a system that never goes down<span className="animate-blink text-ok"> _</span></span></div>
                </div>
              </div>

              <div className="mt-7 grid w-full max-w-md grid-cols-3 gap-2.5 text-sm">
                {([
                  ['cursor', 'Drag a box', '#9ece6a'],
                  ['plug', 'Wire it up', '#5ee0ff'],
                  ['play', 'Survive', '#ffd34d'],
                ] as [IconName, string, string][]).map(([i, t, c], idx) => (
                  <div key={t} className="relative flex flex-col items-center gap-1.5 rounded-xl border border-line bg-panel/80 px-2 py-3 backdrop-blur">
                    <span className="absolute left-2 top-1.5 text-[10px] text-dim">{idx + 1}</span>
                    <Icon name={i} size={24} style={{ color: c }} />
                    <span className="text-[11.5px] font-bold text-fg">{t}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Btn big tone="ok" icon="play" onClick={() => play(next)} className="animate-glow">{started ? 'CONTINUE' : 'PLAY'}</Btn>
                <Btn big tone="ghost" icon="book" onClick={onHelp}>Tutorial</Btn>
              </div>
              {started && <div className="mt-3 text-[11px] text-dim">next up: <span className="text-fg">{fileName(next)}</span></div>}

              {/* levels (small screens) */}
              <div className="mt-8 grid w-full grid-cols-4 gap-2 md:hidden">
                {LEVELS.map((l) => {
                  const open = isUnlocked(l, progress);
                  const s = progress.stars[l.id] ?? 0;
                  return (
                    <button
                      key={l.id}
                      disabled={!open}
                      onClick={() => play(l)}
                      className={cn('flex flex-col items-center gap-1 rounded-xl border bg-panel/80 px-1 py-2', open ? 'border-line' : 'border-line/40 opacity-40', l.id === next.id && 'border-ok')}
                    >
                      <Icon name={open ? l.icon : 'lock'} size={20} className="text-cyan" />
                      <span className="text-[10px] text-dim">{l.endless ? 'inf' : l.n}</span>
                      {!l.endless && open && <Stars n={s} size={10} />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-8 text-[11px] text-dim"><span className="text-ok">$</span> drag. connect. don't get paged at 3am.</div>
              <div className="mt-6"><MySpecBadge /></div>
            </div>
          </div>
        </main>
      </div>

      {/* status bar */}
      <div className="flex h-6 shrink-0 items-center gap-4 bg-[#3b4a8f] px-3 text-[11px] text-white/90">
        <span className="flex items-center gap-1.5"><Icon name="branch" size={12} /> main</span>
        <span className="hidden sm:inline">{totalStars} stars collected</span>
        <span className="ml-auto flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-ok" /> all systems nominal</span>
      </div>
    </div>
  );
}
