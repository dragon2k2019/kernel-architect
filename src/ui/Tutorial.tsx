import { useEffect, useState } from 'react';
import { NODE_DEFS, REQ, TOOL_ORDER, type Kind } from '../game/content';
import { FAIL_HELP } from '../game/sim';
import { sfx } from '../game/sfx';
import { cn } from '../utils/cn';
import { Btn, Dots, Tab } from './Chrome';
import { Face, Icon, NodeIcon, ReqDot, type IconName, type Mood } from './icons';

// The tutorial is a "README.md" preview window. It explains the goal, the pieces, the controls and the scoring.

const CHAPTERS: { id: string; title: string; icon: IconName }[] = [
  { id: 'mission', title: '01 mission', icon: 'target' },
  { id: 'crew', title: '02 your toolbox', icon: 'server' },
  { id: 'play', title: '03 how to play', icon: 'cursor' },
  { id: 'score', title: '04 win, lose, score', icon: 'trophy' },
];

function H({ children, icon, color = '#7aa2f7' }: { children: React.ReactNode; icon: IconName; color?: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-2.5 text-xl font-black tracking-tight text-fg sm:text-2xl">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: color + '22', color }}><Icon name={icon} size={18} /></span>
      {children}
    </h2>
  );
}

function Mission() {
  return (
    <div className="animate-fadeup space-y-4">
      <H icon="target" color="#7ee787">Your mission</H>
      <p className="text-[13.5px] leading-relaxed text-fg">
        You are the engineer on call for a website that is <b className="text-gold">getting famous</b>. Every second, more visitors
        show up. If your system cannot cope, pages break and visitors leave angry.
      </p>

      {/* visual: crowd -> system -> happy */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-ink p-4">
        <div className="flex flex-col items-center gap-1.5 text-center">
          <NodeIcon kind="internet" size={34} color="#7dcfff" />
          <span className="text-[11px] text-dim">visitors arrive</span>
        </div>
        <div className="relative h-[3px] flex-1 overflow-hidden rounded bg-line">
          {[0, 1.1].map((d) => <span key={d} className="absolute -top-[2px] left-0 h-[7px] w-[7px] animate-drift rounded-full bg-cyan" style={{ animationDelay: `${d}s` }} />)}
        </div>
        <div className="flex flex-col items-center gap-1.5 text-center">
          <div className="flex gap-1.5">
            {(['lb', 'server', 'db'] as Kind[]).map((k) => <NodeIcon key={k} kind={k} size={26} color={NODE_DEFS[k].color} />)}
          </div>
          <span className="text-[11px] text-dim">you build this</span>
        </div>
        <div className="relative h-[3px] flex-1 overflow-hidden rounded bg-line">
          {[0.5, 1.6].map((d) => <span key={d} className="absolute -top-[2px] left-0 h-[7px] w-[7px] animate-drift rounded-full bg-ok" style={{ animationDelay: `${d}s` }} />)}
        </div>
        <div className="flex flex-col items-center gap-1.5 text-center">
          <Face mood="happy" size={34} />
          <span className="text-[11px] text-dim">happy, + cash</span>
        </div>
      </div>

      <div className="rounded-2xl border border-ok/40 bg-ok/5 p-4">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-ok"><Icon name="list" size={14} /> Objectives</div>
        <ul className="space-y-2 text-[13px] text-fg">
          <li className="flex gap-2.5"><Icon name="user" size={16} className="mt-0.5 text-ok" /><span><b>Serve enough visitors.</b> Each level has a target, shown as a progress bar at the top.</span></li>
          <li className="flex gap-2.5"><Icon name="heart" size={16} className="mt-0.5 text-bad" /><span><b>Keep visitors happy.</b> Every failed request drains the happiness bar. At zero, the site goes down and you lose.</span></li>
          <li className="flex gap-2.5"><Icon name="coin" size={16} className="mt-0.5 text-gold" /><span><b>Earn and spend cash.</b> Served visitors pay you. Spend it on more boxes while the game runs.</span></li>
          <li className="flex gap-2.5"><Icon name="star" size={16} className="mt-0.5 text-warn" /><span><b>Go for 3 stars.</b> Finish with 99% or better uptime to earn the full set.</span></li>
        </ul>
      </div>
    </div>
  );
}

function Crew() {
  const [sel, setSel] = useState<Kind>('server');
  const all: Kind[] = ['internet', ...TOOL_ORDER];
  const d = NODE_DEFS[sel];
  return (
    <div className="animate-fadeup space-y-4">
      <H icon="server" color="#9ece6a">Your toolbox</H>
      <p className="text-[13px] text-dim">Five kinds of box. Click one to learn what it does. In the game you can also hover any box or tool for the same info.</p>
      <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
        <div className="flex gap-2 overflow-x-auto sm:flex-col">
          {all.map((k) => {
            const x = NODE_DEFS[k];
            return (
              <button
                key={k}
                onClick={() => { setSel(k); sfx.click(); }}
                className={cn('flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-all', sel === k ? 'bg-panel2' : 'border-line bg-ink hover:bg-panel')}
                style={{ borderColor: sel === k ? x.color : undefined }}
              >
                <NodeIcon kind={k} size={20} color={x.color} glow={false} />
                <span className="text-[12px] font-bold text-fg">{x.label}</span>
              </button>
            );
          })}
        </div>
        <div key={sel} className="animate-pop rounded-2xl border bg-ink p-4" style={{ borderColor: d.color + '88' }}>
          <div className="mb-3 flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border bg-panel" style={{ borderColor: d.color + '88', boxShadow: `0 0 28px ${d.color}33` }}>
              <NodeIcon kind={sel} size={32} color={d.color} />
            </div>
            <div>
              <div className="text-lg font-black text-fg">{d.label}</div>
              <div className="text-[11px]" style={{ color: d.color }}>{d.tag}{d.cost > 0 && <span className="text-dim"> · costs ${d.cost}</span>}</div>
            </div>
          </div>
          <p className="mb-2 text-[13px] text-fg">{d.how}</p>
          <p className="mb-2 flex gap-2 text-[12px] text-dim"><Icon name="bulb" size={15} className="mt-0.5 shrink-0 text-gold" /><span><b className="text-fg/90">Think of it as:</b> {d.analogy}</span></p>
          <p className="mb-2 flex gap-2 text-[12px] text-dim"><Icon name="plug" size={15} className="mt-0.5 shrink-0 text-cyan" /><span><b className="text-fg/90">Wiring:</b> {d.wiring}</span></p>
          <p className="flex gap-2 text-[12px] text-dim"><Icon name="target" size={15} className="mt-0.5 shrink-0 text-ok" /><span><b className="text-fg/90">Tip:</b> {d.tip}</span></p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-ink px-4 py-3 text-[12px] text-dim">
        <span className="font-bold text-fg">Visitors come in two shapes:</span>
        <span className="flex items-center gap-2"><ReqDot type="page" color={REQ.page.color} /> <b className="text-cyan">page</b> any Server can answer. Pays $1.</span>
        <span className="flex items-center gap-2"><ReqDot type="data" color={REQ.data.color} /> <b className="text-warn">data</b> needs a Database. Pays $2.</span>
      </div>
    </div>
  );
}

function Play() {
  const steps: { n: string; icon: IconName; title: string; body: React.ReactNode; color: string }[] = [
    { n: '1', icon: 'cursor', title: 'Drag a box onto the board', color: '#9ece6a',
      body: <>Grab a tool from the <b>Components</b> list on the left and drop it on the board. Or tap a tool, then tap the board. Hotkeys <span className="kbd">1</span>-<span className="kbd">4</span>.</> },
    { n: '2', icon: 'plug', title: 'Wire it up', color: '#5ee0ff',
      body: <>Drag from the <b>glowing dot</b> on the right of a box to the next box. Visitors follow the wires. Click a wire to cut it. The Internet needs a wire too.</> },
    { n: '3', icon: 'play', title: 'Press RUN and survive', color: '#ffd34d',
      body: <>Hit <b>RUN</b> (or <span className="kbd">Space</span>). Watch the circles and squares flow. You can pause, build more, move boxes or sell them at any time.</> },
  ];
  return (
    <div className="animate-fadeup space-y-4">
      <H icon="cursor" color="#5ee0ff">How to play</H>
      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-start gap-3.5 rounded-2xl border border-line bg-ink p-3.5" style={{ animation: `fadeup .5s ${i * 0.12}s ease-out both` }}>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: s.color + '22', color: s.color }}>
              <Icon name={s.icon} size={22} />
            </div>
            <div>
              <div className="text-[14px] font-extrabold text-fg"><span className="mr-1.5 text-dim">{s.n}.</span>{s.title}</div>
              <div className="mt-0.5 text-[12.5px] leading-relaxed text-dim">{s.body}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-dashed border-line px-4 py-3 text-[12px] text-dim">
        <div className="mb-1.5 font-bold text-fg">Reading the board</div>
        <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          <span className="flex items-center gap-2">Little bars on a box = its waiting line. Full bar means trouble.</span>
          <span className="flex items-center gap-2">The coach line in the Terminal always tells you the next step.</span>
          <span className="flex items-center gap-2">Face on each box shows how it copes:
            {(['sleep', 'happy', 'sweat', 'hot', 'dead'] as Mood[]).map((m) => <Face key={m} mood={m} size={16} />)}
          </span>
          <span className="flex items-center gap-2">Shortcuts: <span className="kbd">Space</span> run <span className="kbd">Del</span> sell <span className="kbd">Esc</span> cancel</span>
        </div>
      </div>
    </div>
  );
}

function Score() {
  const codes = [503, 504, 502, 500, 403, 404];
  return (
    <div className="animate-fadeup space-y-4">
      <H icon="trophy" color="#ffd34d">Win, lose, score</H>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-ok/40 bg-ok/5 p-3.5">
          <div className="mb-1.5 flex items-center gap-2 text-[13px] font-extrabold text-ok"><Icon name="check" size={16} /> You win when</div>
          <p className="text-[12.5px] leading-relaxed text-fg">You serve the target number of visitors before happiness runs out. Then you get a deploy party.</p>
        </div>
        <div className="rounded-2xl border border-bad/40 bg-bad/5 p-3.5">
          <div className="mb-1.5 flex items-center gap-2 text-[13px] font-extrabold text-bad"><Icon name="skull" size={16} /> You lose when</div>
          <p className="text-[12.5px] leading-relaxed text-fg">Happiness hits zero. Each failed request costs 8 points. Each good one gives back a little.</p>
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-ink p-3.5">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-dim">Stars (based on uptime)</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[['99% or more', 3], ['95% or more', 2], ['below 95%', 1]].map(([t, n]) => (
            <div key={t as string} className="rounded-xl bg-panel px-2 py-2.5">
              <div className="mb-1 flex justify-center gap-0.5">
                {[0, 1, 2].map((i) => <Icon key={i} name="star" size={18} className={i < (n as number) ? 'text-gold' : 'text-line'} />)}
              </div>
              <div className="text-[11px] text-dim">{t}</div>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[11.5px] text-dim">Uptime = good requests out of all requests. Selling a box mid-run refunds 70% of its price (100% before you press RUN).</p>
      </div>
      <details className="rounded-2xl border border-line bg-ink p-3.5">
        <summary className="cursor-pointer text-[12.5px] font-bold text-fg">Error code cheat sheet <span className="font-normal text-dim">(for the curious)</span></summary>
        <ul className="mt-2.5 space-y-1.5 text-[12px] text-dim">
          {codes.map((c) => <li key={c} className="flex gap-2"><b className="w-9 shrink-0 text-bad">{c}</b><span>{FAIL_HELP[c].replace(/^\d+ = /, '')}</span></li>)}
        </ul>
      </details>
      <p className="flex items-center gap-2 text-[12px] text-dim"><Icon name="infinity" size={16} className="text-violet" /> The last level, Production, has no finish line. Stay up as long as you can and beat your best.</p>
    </div>
  );
}

export function Tutorial({ onClose, startAt = 0 }: { onClose: () => void; startAt?: number }) {
  const [i, setI] = useState(startAt);
  const last = i === CHAPTERS.length - 1;
  const go = (n: number) => { setI(Math.max(0, Math.min(CHAPTERS.length - 1, n))); sfx.next(); };

  useEffect(() => { sfx.open(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (last) onClose(); else go(i + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
      else if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  });

  return (
    <div data-modal className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-2 sm:p-5">
      <div className="flex max-h-full w-full max-w-4xl animate-pop flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.7)]">
        <div className="flex h-9 items-center gap-3 border-b border-line bg-ink2 px-3">
          <Dots onClose={onClose} />
          <div className="flex-1 text-center text-[11px] text-dim">README.md - Preview</div>
          <button onClick={onClose} className="rounded px-1.5 py-0.5 text-[11px] text-dim hover:bg-line hover:text-fg">skip</button>
        </div>
        <div className="flex border-b border-line bg-ink2"><Tab icon="book" label="README.md" active color="#ffc857" /></div>
        <div className="flex min-h-0 flex-1">
          <nav className="hidden w-52 shrink-0 flex-col gap-0.5 border-r border-line bg-ink2 p-2.5 sm:flex">
            <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-dim">Outline</div>
            {CHAPTERS.map((c, n) => (
              <button
                key={c.id}
                onClick={() => go(n)}
                className={cn('flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors', n === i ? 'bg-panel2 text-fg' : 'text-dim hover:bg-panel hover:text-fg')}
              >
                <Icon name={n < i ? 'check' : c.icon} size={14} className={n < i ? 'text-ok' : n === i ? 'text-gold' : ''} />
                {c.title}
              </button>
            ))}
          </nav>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-4 sm:p-6" key={i}>
            {i === 0 && <Mission />}
            {i === 1 && <Crew />}
            {i === 2 && <Play />}
            {i === 3 && <Score />}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line bg-ink2 px-4 py-3">
          <div className="flex items-center gap-1.5">
            {CHAPTERS.map((c, n) => (
              <button key={c.id} onClick={() => go(n)} aria-label={c.title} className={cn('h-2 rounded-full transition-all', n === i ? 'w-6 bg-gold' : 'w-2 bg-line hover:bg-dim')} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {i > 0 && <Btn tone="ghost" icon="chevL" onClick={() => go(i - 1)}>Back</Btn>}
            {last
              ? <Btn tone="ok" icon="rocket" onClick={onClose}>Got it. Let's build!</Btn>
              : <Btn tone="gold" onClick={() => go(i + 1)}>Next<Icon name="chevR" size={16} strokeWidth={2.4} /></Btn>}
          </div>
        </div>
      </div>
    </div>
  );
}
