import { useState } from 'react';
import { NODE_DEFS, type Level } from '../game/content';
import { FAIL_HELP, type Sim } from '../game/sim';
import { cn } from '../utils/cn';

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function Intro({ level, onStart, onBack }: { level: Level; onStart: () => void; onBack: () => void }) {
  const tool = level.newTool ? NODE_DEFS[level.newTool] : null;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-pop rounded-3xl border border-line bg-panel p-7 text-center shadow-2xl">
        <div className="text-[11px] uppercase tracking-[0.3em] text-dim">level {level.n}</div>
        <div className="mt-3 text-6xl">{level.emoji}</div>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight">{level.name}</h2>
        <p className="mt-2 text-base text-fg/90">{level.blurb}</p>

        <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm">
          <span className="text-xl">🎯</span>
          <b className="text-ok">{level.goalText}</b>
        </div>

        {tool && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-left" style={{ borderColor: tool.color + '88' }}>
            <span className="text-3xl">{tool.icon}</span>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-ok">new box</div>
              <div className="text-sm font-bold">{tool.label} <span className="font-normal text-dim">· {tool.tag}</span></div>
              <div className="text-xs text-dim">{tool.blurb}</div>
            </div>
          </div>
        )}

        <button onClick={onStart} className="mt-6 w-full rounded-2xl bg-ok py-3.5 text-lg font-extrabold text-ink shadow-lg transition-transform hover:brightness-110 active:scale-95">
          Let's go ▶
        </button>
        <button onClick={onBack} className="mt-3 text-xs text-dim hover:text-fg">← menu</button>
      </div>
    </div>
  );
}

export function Result({ sim, best, hasNext, onNext, onRetry, onMenu }: {
  sim: Sim; best: number; hasNext: boolean; onNext: () => void; onRetry: () => void; onMenu: () => void;
}) {
  const won = sim.status === 'won';
  const endless = sim.level.endless;
  const [copied, setCopied] = useState(false);
  const top = sim.topFailCode;
  const stars = '★'.repeat(sim.stars) + '☆'.repeat(3 - sim.stars);
  const errs = Object.entries(sim.byCode).filter(([c]) => c !== '200').map(([c, n]) => `${c}×${n}`).join(' ') || 'none';
  const report = [
    `KERNEL ARCHITECT · ${endless ? 'Production ♾️' : `L${sim.level.n} ${sim.level.name}`}`,
    endless
      ? `uptime ${mmss(sim.t)} | served ${sim.ok} | p95 ${Math.round(sim.p95)}ms | errors ${errs}`
      : `${won ? '✔ deployed' : '✘ outage'} ${won ? stars : ''} | uptime ${(sim.uptime * 100).toFixed(1)}% | p95 ${Math.round(sim.p95)}ms | errors ${errs}`,
  ].join('\n');
  const copy = async () => {
    try { await navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* ignore */ }
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/80 p-4 backdrop-blur-sm">
      <div className={cn('w-full max-w-md animate-pop rounded-3xl border bg-panel p-7 text-center shadow-2xl', won ? 'border-ok/50' : 'border-bad/50')}>
        <div className="text-6xl">{won ? '🎉' : '💥'}</div>
        <h2 className="mt-3 text-3xl font-extrabold tracking-tight">
          {endless ? `Down after ${mmss(sim.t)}` : won ? 'Deployed!' : 'Outage!'}
        </h2>
        {won && !endless && (
          <div className="mt-2 flex justify-center gap-1 text-4xl">
            {[0, 1, 2].map((i) => (
              <span key={i} className={cn('animate-pop', i < sim.stars ? 'text-warn' : 'text-line')} style={{ animationDelay: `${i * 160}ms` }}>★</span>
            ))}
          </div>
        )}
        <div className="mt-4 rounded-xl bg-ink px-4 py-3 text-left text-xs leading-relaxed">
          <div className="text-dim">$ deploy --prod</div>
          <div className={won || endless ? 'text-ok' : 'text-bad'}>
            {won ? '✔ exit 0' : '✘ exit 1'} <span className="text-dim">· {sim.ok} served · {sim.fail} errors</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 text-fg">
            <span>uptime <b className={sim.uptime >= 0.99 ? 'text-ok' : sim.uptime >= 0.95 ? 'text-warn' : 'text-bad'}>{(sim.uptime * 100).toFixed(1)}%</b></span>
            <span>p95 <b>{Math.round(sim.p95)}ms</b></span>
            {endless && <span>best <b className="text-warn">{Math.max(best, sim.ok)}</b></span>}
          </div>
        </div>
        {!won && top && FAIL_HELP[top] && (
          <p className="mt-3 rounded-xl bg-bad/10 px-4 py-2.5 text-left text-xs text-bad">
            Most errors: {FAIL_HELP[top]}
          </p>
        )}
        {won && sim.stars < 3 && !endless && (
          <p className="mt-3 text-xs text-dim">Want ★★★? Keep uptime above 99%.</p>
        )}

        <div className="mt-5 flex gap-2">
          {won && hasNext ? (
            <button onClick={onNext} className="flex-1 rounded-2xl bg-ok py-3 text-base font-extrabold text-ink hover:brightness-110 active:scale-95">Next ▶</button>
          ) : (
            <button onClick={onRetry} className="flex-1 rounded-2xl bg-ok py-3 text-base font-extrabold text-ink hover:brightness-110 active:scale-95">Try again ↻</button>
          )}
          {won && hasNext && (
            <button onClick={onRetry} className="rounded-2xl bg-panel2 px-4 py-3 text-base font-bold hover:bg-line active:scale-95" title="Retry">↻</button>
          )}
          <button onClick={copy} className="rounded-2xl bg-panel2 px-4 py-3 text-sm font-bold hover:bg-line active:scale-95" title="Copy a shareable report">
            {copied ? '✔ copied' : '📋'}
          </button>
        </div>
        <button onClick={onMenu} className="mt-3 text-xs text-dim hover:text-fg">← menu</button>
      </div>
    </div>
  );
}
