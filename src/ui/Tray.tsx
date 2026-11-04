import type { PointerEvent as RPE } from 'react';
import { NODE_DEFS, type Kind } from '../game/content';
import { sfx } from '../game/sfx';
import { cn } from '../utils/cn';
import { ToolCard, useHoverCard } from './HoverCard';
import { Icon, NodeIcon } from './icons';

interface Props {
  tools: Kind[];
  cash: number;
  armed: Kind | null;
  hint?: Kind;
  onDown: (kind: Kind, e: RPE) => void;
}

function ToolItem({ kind, cash, armed, hint, onDown }: { kind: Kind; cash: number; armed: boolean; hint: boolean; onDown: Props['onDown'] }) {
  const d = NODE_DEFS[kind];
  const hv = useHoverCard();
  const afford = cash >= d.cost;
  return (
    <>
      <button
        {...hv.bind}
        data-tut={`tool-${kind}`}
        onPointerEnter={(e) => { hv.bind.onPointerEnter(e); if (afford) sfx.hover(); }}
        onPointerDown={(e) => { hv.bind.onPointerDown(); onDown(kind, e); }}
        className={cn(
          'touch-none group relative flex shrink-0 items-center gap-2.5 rounded-xl border bg-panel px-2.5 py-2 text-left transition-all',
          'w-[150px] md:w-full',
          afford ? 'cursor-grab hover:-translate-y-0.5 hover:bg-panel2 active:cursor-grabbing md:hover:translate-x-0.5 md:hover:translate-y-0' : 'cursor-not-allowed opacity-50',
          armed ? 'border-ok bg-panel2 ring-1 ring-ok/60' : 'border-line',
          hint && 'animate-ring',
        )}
        style={{ borderLeftColor: d.color, borderLeftWidth: 3 }}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink" style={{ boxShadow: `inset 0 0 0 1px ${d.color}44` }}>
          <NodeIcon kind={kind} size={22} color={d.color} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-extrabold leading-tight text-fg">{d.label}</span>
          <span className="block truncate text-[10px] leading-tight" style={{ color: d.color }}>{d.tag}</span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className={cn('flex items-center gap-0.5 text-[11px] font-extrabold leading-none', afford ? 'text-gold' : 'text-bad')}>
            ${d.cost}
          </span>
          <span className="kbd hidden md:inline-flex">{d.key}</span>
        </span>
      </button>
      <ToolCard kind={kind} rect={hv.rect} cash={cash} />
    </>
  );
}

export function Tray({ tools, cash, armed, hint, onDown }: Props) {
  return (
    <aside className="order-last flex shrink-0 flex-col border-t border-line bg-ink2 md:order-none md:w-[232px] md:border-r md:border-t-0">
      <div className="hidden items-center gap-2 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-dim md:flex">
        <Icon name="folder" size={13} /> Components
      </div>
      <div className="scroll-thin flex gap-2 overflow-x-auto p-2 md:flex-col md:overflow-y-auto md:overflow-x-visible md:px-2.5 md:pb-3">
        {tools.map((k) => (
          <ToolItem key={k} kind={k} cash={cash} armed={armed === k} hint={hint === k} onDown={onDown} />
        ))}
      </div>
      <div className="mt-auto hidden px-4 pb-3 pt-2 text-[10.5px] leading-relaxed text-dim md:block">
        <span className="text-violet">//</span> drag a component onto the board. hover for details.
      </div>
    </aside>
  );
}
