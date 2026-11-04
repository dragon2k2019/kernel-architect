import { useEffect, useRef } from 'react';
import { FAIL_HELP, type Sim } from '../game/sim';
import type { Coach } from '../game/coach';
import { cn } from '../utils/cn';
import { Icon, type IconName } from './icons';

export type PanelTab = 'terminal' | 'objectives' | 'problems';

const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

const TABS: { id: PanelTab; label: string; icon: IconName }[] = [
  { id: 'terminal', label: 'TERMINAL', icon: 'terminal' },
  { id: 'objectives', label: 'OBJECTIVES', icon: 'target' },
  { id: 'problems', label: 'PROBLEMS', icon: 'warn' },
];

interface Props {
  sim: Sim;
  coach: Coach;
  tab: PanelTab;
  open: boolean;
  onTab: (t: PanelTab) => void;
  onToggle: () => void;
}

export function BottomPanel({ sim, coach, tab, open, onTab, onToggle }: Props) {
  const problems = Object.entries(sim.byCode).filter(([c]) => c !== '200').sort((a, b) => b[1] - a[1]);
  const tone = { info: 'text-fg', warn: 'text-warn', bad: 'text-bad', good: 'text-ok' }[coach.tone];

  return (
    <div className={cn('flex shrink-0 flex-col border-t border-line bg-ink2', open ? 'h-[104px] md:h-[172px]' : 'h-auto')}>
      <div className="flex h-8 shrink-0 items-center border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { onTab(t.id); if (!open) onToggle(); }}
            className={cn(
              'relative flex h-full items-center gap-1.5 px-3 text-[10.5px] font-bold tracking-wider transition-colors',
              tab === t.id && open ? 'text-fg' : 'text-dim hover:text-fg',
            )}
          >
            <Icon name={t.icon} size={13} />
            <span className="hidden sm:inline">{t.label}</span>
            {t.id === 'problems' && problems.length > 0 && (
              <span className="rounded-full bg-bad px-1.5 text-[9px] font-black leading-[14px] text-ink">{problems.reduce((a, [, n]) => a + n, 0)}</span>
            )}
            {tab === t.id && open && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded bg-gold" />}
          </button>
        ))}
        <button onClick={onToggle} title="Toggle panel (L)" className="ml-auto mr-2 flex h-6 w-6 items-center justify-center rounded text-dim hover:bg-line hover:text-fg">
          <Icon name="chevR" size={14} className={cn('transition-transform', open ? 'rotate-90' : '-rotate-90')} />
        </button>
      </div>

      {open && tab === 'terminal' && <Terminal sim={sim} coach={coach} tone={tone} />}
      {open && tab === 'objectives' && <Objectives sim={sim} />}
      {open && tab === 'problems' && (
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-2 text-[12px]">
          {problems.length === 0 && <div className="flex items-center gap-2 pt-2 text-ok"><Icon name="check" size={15} /> No problems detected. Nice.</div>}
          {problems.map(([code, n]) => (
            <div key={code} className="flex items-start gap-3 border-b border-line/50 py-1.5">
              <span className="mt-0.5 flex items-center gap-1 font-black text-bad"><Icon name="x" size={12} />{code}</span>
              <span className="flex-1 text-fg">{FAIL_HELP[Number(code)]?.replace(/^\d+ = /, '') ?? 'Unknown error.'}</span>
              <span className="rounded bg-panel2 px-1.5 text-dim">x{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Terminal({ sim, coach, tone }: { sim: Sim; coach: Coach; tone: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const lines = sim.logs.slice(-24);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; });
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={ref} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pt-2 text-[11px] leading-[17px]">
        <div className="text-dim">$ tail -f access.log</div>
        {lines.length === 0 && <div className="text-dim">waiting for traffic...</div>}
        {lines.map((l, i) => {
          const c = l.code === 0 ? 'text-violet' : l.code === 200 ? 'text-ok' : 'text-bad';
          return (
            <div key={`${l.id}-${i}`} className="truncate whitespace-nowrap">
              <span className="text-dim">{fmt(l.t)} </span>
              {l.code === 0 ? (
                <span className={c}>[sys] {l.note}</span>
              ) : (
                <>
                  <b className={c}>{l.code}</b>{' '}
                  <span className="text-fg">{l.method} {l.path}</span>{' '}
                  <span className="text-dim">{l.node} {l.ms}ms{l.code !== 200 || l.note !== 'ok' ? ` - ${l.note}` : ''}</span>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-line/60 bg-ink/60 px-4 py-1.5 text-[12.5px] font-bold">
        <span className="whitespace-nowrap text-ok">architect@kernel<span className="text-dim">:</span><span className="text-blue">~</span><span className="text-dim">$</span></span>
        <span key={coach.text} className={cn('min-w-0 animate-slidein truncate', tone)}>{coach.text}</span>
        <span className="h-3.5 w-2 shrink-0 animate-blink bg-ok/80" />
      </div>
    </div>
  );
}

function Check({ done, label, value, bad }: { done: boolean; label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 py-1">
      <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', done ? 'border-ok bg-ok text-ink' : bad ? 'border-bad text-bad' : 'border-dim text-transparent')}>
        {done ? <Icon name="check" size={11} strokeWidth={3} /> : bad ? <Icon name="x" size={11} strokeWidth={3} /> : null}
      </span>
      <span className={cn('flex-1', done ? 'text-dim line-through' : 'text-fg')}>{label}</span>
      <b className={done ? 'text-ok' : bad ? 'text-bad' : 'text-gold'}>{value}</b>
    </div>
  );
}

function Objectives({ sim }: { sim: Sim }) {
  const goal = sim.level.goal;
  const up = sim.uptime * 100;
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-2 text-[12px]">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-dim">// {sim.level.name}</div>
      {goal ? (
        <Check done={sim.ok >= goal} label={sim.level.goalText} value={`${sim.ok} / ${goal}`} />
      ) : (
        <Check done={false} label="Stay online as long as you can" value={`${sim.ok} served`} />
      )}
      <Check done={false} bad={sim.happy < 25} label="Keep happiness above zero" value={`${Math.round(sim.happy)} / 100`} />
      {goal && <Check done={sim.status === 'won' && up >= 99} bad={sim.fail > 0 && up < 99} label="Bonus: 99% uptime for 3 stars" value={`${up.toFixed(1)}%`} />}
    </div>
  );
}
