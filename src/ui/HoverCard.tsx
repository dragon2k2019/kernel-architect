import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NODE_DEFS, REQ, type Kind } from '../game/content';
import type { SNode } from '../game/sim';
import { Face, Icon, NodeIcon, ReqDot, type Mood } from './icons';

// A floating info card that appears when you hover a tool or a box.
// Uses fixed positioning from the target's bounding box so it never gets clipped by scroll areas.

export type Side = 'right' | 'top' | 'left' | 'bottom';

export function useHoverCard() {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const el = useRef<HTMLElement | null>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const bind = {
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'mouse') return;
      const t = e.currentTarget;
      el.current = t;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setRect(t.getBoundingClientRect()), 140);
    },
    onPointerLeave: () => { clearTimeout(timer.current); setRect(null); },
    onPointerDown: () => { clearTimeout(timer.current); setRect(null); },
  };
  const refresh = useCallback(() => { if (el.current && rect) setRect(el.current.getBoundingClientRect()); }, [rect]);
  return { rect, bind, refresh };
}

export function CardShell({ rect, side = 'right', width = 300, children, accent = '#7aa2f7' }: {
  rect: DOMRect | null; side?: Side; width?: number; children: ReactNode; accent?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (!rect || !ref.current) { setPos(null); return; }
    const h = ref.current.offsetHeight;
    const w = Math.min(width, window.innerWidth - 16);
    const gap = 12;
    let left = 0; let top = 0;
    let s = side;
    if (s === 'right' && rect.right + gap + w > window.innerWidth - 8) s = 'top';
    if (s === 'left' && rect.left - gap - w < 8) s = 'top';
    if (s === 'top' && rect.top - gap - h < 8) s = 'bottom';
    if (s === 'right') { left = rect.right + gap; top = rect.top + rect.height / 2 - h / 2; }
    else if (s === 'left') { left = rect.left - gap - w; top = rect.top + rect.height / 2 - h / 2; }
    else if (s === 'top') { left = rect.left + rect.width / 2 - w / 2; top = rect.top - gap - h; }
    else { left = rect.left + rect.width / 2 - w / 2; top = rect.bottom + gap; }
    left = Math.max(8, Math.min(window.innerWidth - w - 8, left));
    top = Math.max(8, Math.min(window.innerHeight - h - 8, top));
    setPos({ left, top });
  }, [rect, side, width]);

  if (!rect) return null;
  return createPortal(
    <div
      ref={ref}
      data-hovercard
      className="pointer-events-none fixed z-[80] overflow-hidden rounded-xl border bg-ink/95 shadow-[0_18px_50px_rgba(0,0,0,0.65)] backdrop-blur-md"
      style={{
        width: Math.min(width, window.innerWidth - 16),
        left: pos?.left ?? -9999, top: pos?.top ?? -9999,
        borderColor: accent + '99',
        opacity: pos ? 1 : 0,
        animation: pos ? 'pop 0.18s ease-out both' : undefined,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

function Stat({ icon, label, value }: { icon: Parameters<typeof Icon>[0]['name']; label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 rounded-lg bg-panel px-1 py-1.5">
      <Icon name={icon} size={14} className="text-dim" />
      <b className="text-[12px] leading-none text-fg">{value}</b>
      <span className="text-[9px] uppercase tracking-wider text-dim">{label}</span>
    </div>
  );
}

/** The card shown for each tool in the sidebar. */
export function ToolCard({ kind, rect, cash }: { kind: Kind; rect: DOMRect | null; cash?: number }) {
  const d = NODE_DEFS[kind];
  const afford = cash === undefined || cash >= d.cost;
  return (
    <CardShell rect={rect} side="right" width={310} accent={d.color}>
      <div className="flex items-center gap-3 border-b border-line px-3.5 py-3" style={{ background: `linear-gradient(120deg, ${d.color}26, transparent)` }}>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border bg-panel" style={{ borderColor: d.color + '88' }}>
          <NodeIcon kind={kind} size={26} color={d.color} />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-extrabold leading-tight text-fg">{d.label}</div>
          <div className="text-[11px] text-dim"><span style={{ color: d.color }}>{d.tag}</span>{d.key && <> · press <span className="kbd">{d.key}</span></>}</div>
        </div>
      </div>
      <div className="space-y-2.5 px-3.5 py-3 text-[12px] leading-relaxed">
        <p className="text-fg">{d.how}</p>
        <p className="flex gap-2 text-dim"><Icon name="bulb" size={14} className="mt-0.5 text-gold" /><span><b className="text-fg/90">Think of it as:</b> {d.analogy}</span></p>
        {(d.rate > 0 || d.queue > 0 || d.cost > 0) && (
          <div className="flex gap-1.5">
            <Stat icon="coin" label="cost" value={`$${d.cost}`} />
            <Stat icon="bolt" label="speed" value={d.rate > 0 ? `${d.rate}/s` : 'instant'} />
            <Stat icon="list" label="queue" value={d.queue > 0 ? `${d.queue}` : 'none'} />
          </div>
        )}
        <p className="flex gap-2 text-dim"><Icon name="plug" size={14} className="mt-0.5 text-cyan" /><span><b className="text-fg/90">Wiring:</b> {d.wiring}</span></p>
        <p className="flex gap-2 text-dim"><Icon name="target" size={14} className="mt-0.5 text-ok" /><span><b className="text-fg/90">Tip:</b> {d.tip}</span></p>
        <p className="border-t border-line pt-2 text-[10.5px] text-dim"><span className="text-violet">// nerd note:</span> {d.nerd}</p>
        {!afford && <p className="rounded-md bg-bad/10 px-2 py-1 text-[11px] font-bold text-bad">Not enough cash yet. Keep serving visitors.</p>}
      </div>
    </CardShell>
  );
}

function moodOf(n: SNode): Mood {
  const d = NODE_DEFS[n.kind];
  if (n.down > 0) return 'dead';
  if (!d.queue) return 'happy';
  const q = n.queue.length / d.queue;
  if (q >= 0.75) return 'hot';
  if (q >= 0.4) return 'sweat';
  return n.cur || q > 0 ? 'happy' : 'sleep';
}

const STATUS: Record<Mood, { text: string; color: string }> = {
  sleep: { text: 'Idle. Waiting for visitors.', color: '#7aa2f7' },
  happy: { text: 'Working happily.', color: '#7ee787' },
  sweat: { text: 'Getting busy. The line is growing.', color: '#ffc857' },
  hot: { text: 'Overloaded! Add another one.', color: '#ff6b8b' },
  dead: { text: 'Crashed. Rebooting...', color: '#ff6b8b' },
};

/** Live card for a box on the board. */
export function NodeCard2({ node, rect, ins, outs }: { node: SNode | undefined; rect: DOMRect | null; ins: number; outs: number }) {
  if (!node) return null;
  const d = NODE_DEFS[node.kind];
  const mood = node.kind === 'internet' ? null : moodOf(node);
  const st = mood ? STATUS[mood] : { text: 'Visitors arrive here and follow your wires.', color: '#7dcfff' };
  return (
    <CardShell rect={rect} side="top" width={280} accent={d.color}>
      <div className="flex items-center gap-3 border-b border-line px-3.5 py-2.5" style={{ background: `linear-gradient(120deg, ${d.color}22, transparent)` }}>
        <NodeIcon kind={node.kind} size={24} color={d.color} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-extrabold text-fg">{d.label}</div>
          <div className="text-[10.5px] text-dim">{node.name} <span style={{ color: d.color }}>({d.tag})</span></div>
        </div>
        {mood && <Face mood={mood} size={26} />}
      </div>
      <div className="space-y-2 px-3.5 py-2.5 text-[11.5px] leading-relaxed">
        <p className="font-bold" style={{ color: st.color }}>{st.text}</p>
        <p className="text-dim">{d.blurb}</p>
        {node.kind !== 'internet' && (
          <div className="flex gap-1.5">
            <Stat icon="user" label="handled" value={String(node.handled)} />
            {d.queue > 0 && <Stat icon="list" label="waiting" value={`${node.queue.length}/${d.queue}`} />}
            <Stat icon="plug" label="in / out" value={`${ins} / ${outs}`} />
          </div>
        )}
        {node.kind === 'internet' && (
          <div className="flex items-center gap-3 text-dim">
            <span className="flex items-center gap-1.5"><ReqDot type="page" color={REQ.page.color} /> page</span>
            <span className="flex items-center gap-1.5"><ReqDot type="data" color={REQ.data.color} /> data</span>
          </div>
        )}
        {node.kind !== 'internet' && <p className="text-[10.5px] text-dim">Drag to move. Click, then sell for a refund.</p>}
      </div>
    </CardShell>
  );
}
