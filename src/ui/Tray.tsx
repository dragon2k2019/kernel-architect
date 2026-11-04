import type { PointerEvent as RPE } from 'react';
import { NODE_DEFS, type Kind } from '../game/content';
import { cn } from '../utils/cn';

interface Props {
  tools: Kind[];
  cash: number;
  armed: Kind | null;
  hint?: Kind;
  onDown: (kind: Kind, e: RPE) => void;
}

export function Tray({ tools, cash, armed, hint, onDown }: Props) {
  return (
    <div className="scroll-thin flex items-stretch justify-center gap-2 overflow-x-auto pb-1 pt-1.5">
      {tools.map((k) => {
        const d = NODE_DEFS[k];
        const afford = cash >= d.cost;
        return (
          <div key={k} className="group relative">
            <div className="pointer-events-none absolute -top-10 left-1/2 z-30 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-ink px-3 py-1.5 text-xs text-fg shadow-xl group-hover:block">
              {d.blurb} <span className="text-dim">· {d.tag}</span>
            </div>
            <button
              onPointerDown={(e) => onDown(k, e)}
              className={cn(
                'touch-none relative flex h-[78px] w-[94px] flex-col items-center justify-center rounded-xl border-2 bg-panel2 transition-all',
                afford ? 'cursor-grab hover:-translate-y-0.5 hover:brightness-125 active:cursor-grabbing' : 'cursor-not-allowed opacity-45',
                armed === k && 'ring-2 ring-ok',
                hint === k && 'animate-ring',
              )}
              style={{ borderColor: armed === k ? '#9ece6a' : d.color + '88' }}
            >
              <span className="absolute right-1.5 top-1 rounded bg-ink px-1 text-[9px] text-dim">{d.key}</span>
              <span className="text-[28px] leading-none" style={{ filter: `drop-shadow(0 0 8px ${d.color}88)` }}>{d.icon}</span>
              <span className="mt-1 text-[11px] font-bold leading-none">{d.label}</span>
              <span className={cn('mt-1 text-[11px] font-bold leading-none', afford ? 'text-warn' : 'text-bad')}>${d.cost}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
