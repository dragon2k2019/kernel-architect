import type { Sim } from '../game/sim';
import { cn } from '../utils/cn';

const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** A quiet access-log tail. Normies can ignore it; engineers will stare at it. */
export function LogPanel({ sim }: { sim: Sim }) {
  const lines = sim.logs.slice(-7);
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 w-[330px] rounded-lg border border-line/70 bg-ink/75 p-2 text-[10px] leading-[15px] backdrop-blur">
      <div className="mb-1 text-dim">$ tail -f access.log</div>
      {lines.length === 0 && <div className="text-dim">waiting for traffic…<span className="animate-blink">▌</span></div>}
      {lines.map((l, i) => {
        const c = l.code === 0 ? 'text-violet' : l.code === 200 ? 'text-ok' : 'text-bad';
        return (
          <div key={`${l.id}-${i}`} className={cn('truncate whitespace-nowrap', i < lines.length - 4 && 'opacity-60')}>
            <span className="text-dim">{fmt(l.t)} </span>
            {l.code === 0 ? (
              <span className={c}>[sys] {l.note}</span>
            ) : (
              <>
                <b className={c}>{l.code}</b>{' '}
                <span className="text-fg">{l.method} {l.path}</span>{' '}
                <span className="text-dim">{l.node} {l.ms}ms{l.code !== 200 || l.note !== 'ok' ? ` · ${l.note}` : ''}</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
