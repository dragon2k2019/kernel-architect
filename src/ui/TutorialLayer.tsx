import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { NODE_DEFS, type Kind } from '../game/content';
import { BOARD_W, NODE_H, NODE_W, type Sim } from '../game/sim';
import type { TutStep } from '../game/tutorial';
import { fx } from '../game/particles';
import { sfx } from '../game/sfx';
import { cn } from '../utils/cn';
import { Btn } from './Chrome';
import { Icon, NodeIcon } from './icons';

interface R { x: number; y: number; w: number; h: number }
const PAD = 6;
const CARD_W = 300;

/** Find every element tagged data-tut="name" and return padded viewport rects. */
function measure(names: string[]): R[] {
  const out: R[] = [];
  const vw = window.innerWidth; const vh = window.innerHeight;
  for (const name of names) {
    document.querySelectorAll(`[data-tut~="${name}"]`).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const x = Math.max(0, r.left - PAD); const y = Math.max(0, r.top - PAD);
      out.push({ x, y, w: Math.min(vw, r.right + PAD) - x, h: Math.min(vh, r.bottom + PAD) - y });
    });
  }
  return out;
}

const same = (a: R[], b: R[]) =>
  a.length === b.length && a.every((r, i) => Math.abs(r.x - b[i].x) < 1 && Math.abs(r.y - b[i].y) < 1 && Math.abs(r.w - b[i].w) < 1 && Math.abs(r.h - b[i].h) < 1);

const overlap = (a: R, b: R) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Pick the card spot that covers the least of the spotlight (never the primary target). */
function placeCard(rects: R[], size: { w: number; h: number }, vw: number, vh: number): { x: number; y: number } {
  const { w, h } = size;
  const clampX = (x: number) => Math.max(12, Math.min(vw - w - 12, x));
  const clampY = (y: number) => Math.max(12, Math.min(vh - h - 12, y));
  if (!rects.length) return { x: clampX((vw - w) / 2), y: clampY((vh - h) / 2) };
  const p = rects[0];
  const cands = [
    { x: p.x + p.w / 2 - w / 2, y: p.y + p.h + 14 },
    { x: p.x + p.w / 2 - w / 2, y: p.y - h - 14 },
    { x: p.x + p.w + 14, y: p.y + p.h / 2 - h / 2 },
    { x: p.x - w - 14, y: p.y + p.h / 2 - h / 2 },
    { x: (vw - w) / 2, y: vh - h - 16 },
    { x: (vw - w) / 2, y: 52 },
  ];
  let best = { x: 12, y: 12 }; let bestScore = Infinity;
  for (const c of cands) {
    const card: R = { x: clampX(c.x), y: clampY(c.y), w, h };
    let score = overlap(card, p) > 0 ? 1e9 : 0;
    for (let k = 1; k < rects.length; k++) score += overlap(card, rects[k]);
    if (score < bestScore) { bestScore = score; best = { x: card.x, y: card.y }; }
  }
  return best;
}

// where a new box would nicely go on the board (sim coordinates, box centre)
const DROP_SPOTS: [number, number][] = [[300, 236], [560, 110], [560, 360], [700, 236], [420, 60], [420, 440], [160, 440], [820, 110]];

function Fact({ kind }: { kind: Kind }) {
  const d = NODE_DEFS[kind];
  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl border bg-ink px-3 py-2.5" style={{ borderColor: d.color + '66' }}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-panel" style={{ boxShadow: `inset 0 0 0 1px ${d.color}55` }}>
        <NodeIcon kind={kind} size={26} color={d.color} />
      </span>
      <div className="min-w-0">
        <div className="text-[13px] font-extrabold text-fg">{d.label}</div>
        <div className="text-[11px] leading-snug text-dim">{d.blurb}</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-bold">
          <span className="rounded bg-panel px-1.5 py-0.5" style={{ color: d.color }}>{d.tag}</span>
          {d.cost > 0 && <span className="rounded bg-panel px-1.5 py-0.5 text-gold">${d.cost}</span>}
          {d.rate > 0 && <span className="rounded bg-panel px-1.5 py-0.5 text-ok">{d.rate} visitors/s</span>}
        </div>
      </div>
    </div>
  );
}

interface Props {
  steps: TutStep[];
  sim: Sim;
  /** Changes whenever the game re-renders, so step conditions are re-checked. */
  tick: number;
  /** The layer publishes the active step here so the game can lock keys / freeze the sim. */
  stepRef: MutableRefObject<TutStep | null>;
  onDone: () => void;
}

export function TutorialLayer({ steps, sim, tick, stepRef, onDone }: Props) {
  const [i, setI] = useState(0);
  const step: TutStep | undefined = steps[i];
  stepRef.current = step ?? null;
  void tick;

  const [rects, setRects] = useState<R[]>([]);
  const [board, setBoard] = useState<R | null>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [size, setSize] = useState({ w: CARD_W, h: 190 });
  const cardRef = useRef<HTMLDivElement>(null);
  const shownAt = useRef(performance.now());
  const doneOnce = useRef(false);
  const posRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    document.body.classList.add('tutoring');
    return () => document.body.classList.remove('tutoring');
  }, []);

  // timestamp each step as it appears (declared before the state machine so it runs first)
  useEffect(() => { shownAt.current = performance.now(); }, [i]);

  // the state machine: runs after every render
  useEffect(() => {
    if (!step) {
      if (!doneOnce.current) { doneOnce.current = true; onDone(); }
      return;
    }
    // if the player undid something an earlier step asked for (sold the box, cut the wire), go back to it
    for (let j = 0; j < i; j++) {
      const p = steps[j];
      if (p.mode !== 'next' && p.done && !p.done(sim)) { setI(j); return; }
    }
    if (step.mode !== 'next' && step.done?.(sim)) {
      // steps that were already satisfied when reached fly by silently
      if (performance.now() - shownAt.current > 350) {
        sfx.stepDone(Math.min(i, 3));
        const c = posRef.current;
        fx.sparks(c.x + size.w / 2, c.y + 24, '#7ee787', 16, 230);
      }
      setI(i + 1);
    }
  });

  // keep spotlight rects fresh (cheap: a few querySelectors, 10x per second, state only changes if something moved)
  const holesKey = (step?.holes ?? []).join('|');
  useEffect(() => {
    const names = holesKey ? holesKey.split('|') : [];
    const run = () => {
      const next = measure(names);
      setRects((prev) => (same(prev, next) ? prev : next));
      const b = document.querySelector('[data-tut~="board"]')?.getBoundingClientRect();
      setBoard((prev) => {
        if (!b) return null;
        const nb = { x: b.left, y: b.top, w: b.width, h: b.height };
        return prev && same([prev], [nb]) ? prev : nb;
      });
      setVp((prev) => (prev.w === window.innerWidth && prev.h === window.innerHeight ? prev : { w: window.innerWidth, h: window.innerHeight }));
    };
    run();
    const id = window.setInterval(run, 100);
    window.addEventListener('resize', run);
    return () => { clearInterval(id); window.removeEventListener('resize', run); };
  }, [holesKey, i]);

  useLayoutEffect(() => {
    const r = cardRef.current?.getBoundingClientRect();
    if (r && (Math.abs(r.width - size.w) > 1 || Math.abs(r.height - size.h) > 1)) setSize({ w: r.width, h: r.height });
  });

  if (!step) return null;

  const holes = step.holes ?? [];
  const lockAll = holes.length === 0;
  // if holes were requested but none exist on screen, never trap the player behind the dim layer
  const blocking = lockAll || rects.length > 0;
  const clip = rects.length
    ? `path(evenodd, "M0 0H${vp.w}V${vp.h}H0Z${rects.map((r) => `M${Math.round(r.x)} ${Math.round(r.y)}h${Math.round(r.w)}v${Math.round(r.h)}h${-Math.round(r.w)}Z`).join('')}")`
    : undefined;

  const cw = Math.min(CARD_W, vp.w - 24);
  const pos = placeCard(rects, { w: cw, h: size.h }, vp.w, vp.h);
  posRef.current = pos;
  const cardRect: R = { x: pos.x, y: pos.y, w: cw, h: size.h };

  // "drop here" marker: first free spot on the board that the card is not sitting on
  let marker: { x: number; y: number } | null = null;
  if (step.drop && board) {
    const tool = holes.find((h) => h.startsWith('tool-'))?.slice(5) as Kind | undefined;
    const scale = board.w / BOARD_W;
    const free = DROP_SPOTS.filter(([bx, by]) => !tool || sim.canPlace(tool, bx - NODE_W / 2, by - NODE_H / 2).ok);
    const spots = free.length ? free : DROP_SPOTS;
    const toScreen = ([bx, by]: [number, number]) => ({ x: board.x + bx * scale, y: board.y + by * scale });
    const clear = spots.find((s) => {
      const p = toScreen(s);
      return overlap({ x: p.x - 62, y: p.y - 52, w: 124, h: 104 }, cardRect) === 0;
    });
    marker = toScreen(clear ?? spots[0]);
  }

  const bigHole = (r: R) => r.w * r.h > vp.w * vp.h * 0.25;

  return (
    <>
      {blocking && (
        <div
          className={cn('fixed inset-0 z-[78]', step.mode === 'watch' ? 'bg-black/35' : 'bg-black/60')}
          style={clip ? { clipPath: clip } : undefined}
        />
      )}
      {rects.map((r, k) => (
        <div key={`${step.id}-${k}`} className={cn('tut-ring z-[79]', bigHole(r) && 'tut-ring-static')} style={{ left: r.x, top: r.y, width: r.w, height: r.h }} />
      ))}
      {marker && (
        <div className="tut-drop z-[79]" style={{ left: marker.x, top: marker.y }}>
          <span className="flex flex-col items-center gap-1"><Icon name="cursor" size={16} />drop here</span>
        </div>
      )}

      <div ref={cardRef} className="pointer-events-none fixed z-[85]" style={{ left: pos.x, top: pos.y, width: cw }}>
        <div key={step.id} className="animate-pop rounded-2xl border border-ok/50 bg-panel shadow-[0_18px_60px_rgba(0,0,0,0.75)]">
          <div className="flex items-center gap-2.5 border-b border-line px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-ok">tutorial</span>
            <div className="flex flex-1 gap-1">
              {steps.map((s, k) => <span key={s.id} className={cn('h-1 flex-1 rounded-full', k < i ? 'bg-ok' : k === i ? 'bg-ok/60' : 'bg-line')} />)}
            </div>
            <button onClick={onDone} className="pointer-events-auto text-[10px] text-dim hover:text-fg">skip</button>
          </div>
          <div className="p-3.5">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ok/15 text-ok"><Icon name={step.icon} size={18} /></span>
              <div className="min-w-0">
                <div className="text-[15px] font-black leading-tight text-fg">{step.title}</div>
                <p className="mt-1 text-[12.5px] leading-snug text-dim">{step.body}</p>
              </div>
            </div>
            {step.fact && <Fact kind={step.fact} />}
            <div className="mt-3 flex items-center justify-end">
              {step.mode === 'next' ? (
                <Btn tone="ok" onClick={() => { sfx.next(); setI(i + 1); }} className="pointer-events-auto">{step.btn ?? 'Next'}</Btn>
              ) : (
                <span className="flex items-center gap-2 text-[11px] text-dim">
                  <span className="h-2 w-2 rounded-full bg-ok" style={{ animation: 'tutdot 1s ease-in-out infinite' }} />
                  {step.mode === 'watch' ? 'watching...' : 'your move'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
