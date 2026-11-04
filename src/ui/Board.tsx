import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPE, type RefObject } from 'react';
import { NODE_DEFS, REQ, type Kind } from '../game/content';
import { BOARD_H, BOARD_W, NODE_H, NODE_W, Sim, type SNode } from '../game/sim';
import { inPort, outPort, wirePath } from '../game/geom';
import type { CoachTarget } from '../game/coach';
import { cn } from '../utils/cn';
import { LogPanel } from './LogPanel';

export interface Hand { kind: Kind; x: number | null; y: number | null; dragging: boolean }
export interface Wiring { from: number; x: number; y: number; armed: boolean; dragging: boolean }

interface Props {
  sim: Sim;
  tick: number;
  boardRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  selected: number | null;
  hand: Hand | null;
  wiring: Wiring | null;
  target?: CoachTarget;
  showLog: boolean;
  onBoardDown: (e: RPE) => void;
  onBoardMove: (e: RPE) => void;
  onNodeDown: (id: number, e: RPE) => void;
  onPortDown: (id: number, e: RPE) => void;
  onCut: (id: number) => void;
  onSell: (id: number) => void;
}

function face(n: SNode): string {
  const def = NODE_DEFS[n.kind];
  if (n.down > 0) return '💀';
  if (n.kind === 'internet') return '';
  if (!def.queue) return '🙂';
  const q = n.queue.length / def.queue;
  if (q >= 0.75) return '🥵';
  if (q >= 0.4) return '😅';
  return n.cur || q > 0 ? '🙂' : '😴';
}

export function Board(p: Props) {
  const { sim, boardRef, canvasRef } = p;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      setScale(Math.max(0.3, Math.min((r.width - 16) / BOARD_W, (r.height - 16) / BOARD_H)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = Math.min(3, scale * (window.devicePixelRatio || 1));
    c.width = Math.round(BOARD_W * ratio);
    c.height = Math.round(BOARD_H * ratio);
  }, [scale, canvasRef]);

  const nodeMap = new Map(sim.nodes.map((n) => [n.id, n]));
  const running = sim.status === 'running';
  const ghost = p.hand && p.hand.x !== null && p.hand.y !== null
    ? (() => {
        const pos = sim.clampPos(p.hand.x - NODE_W / 2, p.hand.y - NODE_H / 2);
        return { ...pos, kind: p.hand.kind, ok: sim.canPlace(p.hand.kind, pos.x, pos.y).ok };
      })()
    : null;
  const sel = p.selected !== null ? nodeMap.get(p.selected) : undefined;

  return (
    <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: BOARD_W * scale, height: BOARD_H * scale, transform: 'translate(-50%, -50%)' }}
      >
        <div
          ref={boardRef}
          onPointerDown={p.onBoardDown}
          onPointerMove={p.onBoardMove}
          className={cn(
            'board-bg touch-none absolute left-0 top-0 origin-top-left overflow-hidden rounded-2xl border border-line shadow-[0_0_60px_rgba(122,162,247,0.08)]',
            p.hand && 'cursor-copy',
          )}
          style={{ width: BOARD_W, height: BOARD_H, transform: `scale(${scale})` }}
        >
          {/* wires */}
          <svg className="pointer-events-none absolute inset-0" width={BOARD_W} height={BOARD_H}>
            {sim.wires.map((w) => {
              const a = nodeMap.get(w.from); const b = nodeMap.get(w.to);
              if (!a || !b) return null;
              const d = wirePath(outPort(a), inPort(b));
              const dead = b.down > 0;
              const col = dead ? '#f7768e' : NODE_DEFS[a.kind].color;
              return (
                <g key={w.id} className="wire">
                  <path className="wire-line" d={d} fill="none" stroke="#2b2f48" strokeWidth={5} strokeLinecap="round" />
                  <path
                    className={cn('wire-flow', running && 'animate-flow')}
                    d={d} fill="none" stroke={col} strokeOpacity={0.85} strokeWidth={3} strokeLinecap="round" strokeDasharray="2 10"
                  />
                  <path
                    d={d} fill="none" stroke="transparent" strokeWidth={20}
                    style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => p.onCut(w.id)}
                  >
                    <title>Click to cut this wire</title>
                  </path>
                </g>
              );
            })}
            {p.wiring && nodeMap.get(p.wiring.from) && (
              <path
                d={wirePath(outPort(nodeMap.get(p.wiring.from)!), { x: p.wiring.x, y: p.wiring.y })}
                fill="none" stroke="#9ece6a" strokeWidth={3} strokeDasharray="7 6" strokeLinecap="round"
              />
            )}
          </svg>

          {/* packets */}
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute left-0 top-0"
            style={{ width: BOARD_W, height: BOARD_H }}
          />

          {/* nodes */}
          {sim.nodes.map((n) => (
            <NodeCard
              key={n.id} sim={sim} n={n}
              selected={p.selected === n.id}
              wiring={p.wiring}
              target={p.target}
              onDown={p.onNodeDown} onPortDown={p.onPortDown}
            />
          ))}

          {/* ghost while placing */}
          {ghost && (
            <div
              className={cn('pointer-events-none absolute flex flex-col items-center justify-center rounded-xl border-2 border-dashed', ghost.ok ? 'border-ok bg-ok/10' : 'border-bad bg-bad/10')}
              style={{ left: ghost.x, top: ghost.y, width: NODE_W, height: NODE_H }}
            >
              <span className="text-3xl opacity-80">{NODE_DEFS[ghost.kind].icon}</span>
              <span className="text-[10px] text-dim">{ghost.ok ? 'drop here' : 'no room / no $'}</span>
            </div>
          )}

          {/* sell popover */}
          {sel && sel.kind !== 'internet' && !p.wiring && (
            <div
              className="absolute z-20 -translate-x-1/2"
              style={{ left: sel.x + NODE_W / 2, top: Math.max(4, sel.y - 38) }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => p.onSell(sel.id)}
                className="whitespace-nowrap rounded-lg border border-bad/60 bg-panel px-3 py-1.5 text-xs font-bold text-bad shadow-lg hover:bg-bad hover:text-ink"
              >
                🗑 Sell +${sim.sellValue(sel.id)}
              </button>
            </div>
          )}

          {/* floating +$ / 503 */}
          {sim.fx.map((f) => (
            <div
              key={f.id}
              className="pointer-events-none absolute z-10 animate-floatup text-[13px] font-extrabold"
              style={{ left: f.x, top: f.y, color: f.color, textShadow: '0 1px 4px #000' }}
            >
              {f.text}
            </div>
          ))}

          {/* live metrics */}
          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-1.5 text-[11px]">
            <Chip label="traffic" value={`${sim.traffic.toFixed(1)}/s`} tone={sim.spiking ? 'bad' : 'cyan'} />
            <Chip label="uptime" value={`${(sim.uptime * 100).toFixed(1)}%`} tone={sim.uptime >= 0.99 ? 'ok' : sim.uptime >= 0.95 ? 'warn' : 'bad'} />
            <Chip label="p95" value={`${Math.round(sim.p95)}ms`} tone={sim.p95 > 400 ? 'warn' : 'dim'} />
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 flex gap-3 rounded-lg bg-ink/60 px-2.5 py-1.5 text-[11px] text-dim">
            <span><span style={{ color: REQ.page.color }}>●</span> page</span>
            <span><span style={{ color: REQ.data.color }}>■</span> data</span>
          </div>

          {p.showLog && <LogPanel sim={sim} />}

          {/* event banner */}
          {sim.banner && (
            <div className="pointer-events-none absolute left-0 right-0 top-3 z-30 flex justify-center">
              <div
                key={sim.banner.text}
                className={cn(
                  'animate-shake rounded-xl border px-5 py-2 text-sm font-extrabold shadow-xl backdrop-blur',
                  sim.banner.kind === 'bad' ? 'border-bad bg-bad/20 text-bad' : 'border-warn bg-warn/15 text-warn',
                )}
              >
                {sim.banner.text}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'bad' | 'cyan' | 'dim' }) {
  const c = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', cyan: 'text-cyan', dim: 'text-fg' }[tone];
  return (
    <span className="rounded-lg bg-ink/70 px-2 py-1 text-dim">
      {label} <b className={c}>{value}</b>
    </span>
  );
}

function NodeCard({ sim, n, selected, wiring, target, onDown, onPortDown }: {
  sim: Sim; n: SNode; selected: boolean; wiring: Wiring | null; target?: CoachTarget;
  onDown: Props['onNodeDown']; onPortDown: Props['onPortDown'];
}) {
  const def = NODE_DEFS[n.kind];
  const down = n.down > 0;
  const q = def.queue ? n.queue.length / def.queue : 0;
  const isTarget = target?.node === n.id;
  const wiringValid = wiring ? wiring.from !== n.id && sim.canWire(wiring.from, n.id).ok : false;
  const dimmed = wiring && wiring.from !== n.id && !wiringValid;
  const portHint = target?.port === n.id && !wiring;
  return (
    <div
      data-node={n.id}
      onPointerDown={(e) => onDown(n.id, e)}
      className={cn(
        'touch-none absolute flex flex-col rounded-xl border-2 bg-panel px-2 pb-1.5 pt-1.5 transition-[opacity,filter] duration-150',
        n.kind !== 'internet' && 'cursor-grab active:cursor-grabbing',
        down && 'opacity-60 grayscale',
        dimmed && 'opacity-40',
        q >= 0.75 && !down && 'animate-alarm',
        isTarget && 'animate-ring',
      )}
      style={{
        left: n.x, top: n.y, width: NODE_W, height: NODE_H,
        borderColor: down ? '#f7768e' : wiringValid ? '#9ece6a' : def.color + 'bb',
        background: `linear-gradient(160deg, ${def.color}18, #1a1b26 55%)`,
        boxShadow: selected
          ? `0 0 0 3px ${def.color}55, 0 0 26px ${def.color}55`
          : wiringValid ? '0 0 0 4px rgba(158,206,106,0.35)' : '0 8px 20px rgba(0,0,0,0.45)',
      }}
    >
      <div className="flex items-start justify-between leading-none">
        <span className="text-[26px]" style={{ filter: `drop-shadow(0 0 8px ${def.color}88)` }}>{def.icon}</span>
        <span className="text-lg">{face(n)}</span>
      </div>
      <div className="mt-0.5 truncate text-[11px] font-bold leading-tight text-fg">{def.label}</div>
      <div className="truncate text-[10px] leading-tight text-dim">{down ? `rebooting ${Math.ceil(n.down)}s…` : n.name}</div>
      <div className="mt-auto flex h-[10px] items-center gap-[3px]">
        {def.queue > 0 ? (
          <>
            <span
              className={cn('h-2.5 w-3 shrink-0 rounded-[3px]', n.cur && 'animate-pulse')}
              style={{ background: n.cur ? REQ[n.cur.type].color : '#2a2e45' }}
              title="working on"
            />
            <span className="mx-px h-2.5 w-px shrink-0 bg-line" />
            {Array.from({ length: def.queue }, (_, i) => (
              <span
                key={i}
                className="h-2 flex-1 rounded-[2px]"
                style={{ background: n.queue[i] ? REQ[n.queue[i].type].color : '#2a2e45' }}
              />
            ))}
          </>
        ) : n.kind === 'internet' ? (
          <span className="text-[10px] text-cyan">{sim.status === 'running' ? `${sim.traffic.toFixed(1)} req/s` : 'visitors'}</span>
        ) : (
          <span className="text-[10px] text-dim">↦ {n.handled}</span>
        )}
      </div>

      {n.kind !== 'internet' && (
        <span
          className={cn('absolute -left-[7px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 bg-ink', wiringValid ? 'animate-ring border-ok' : 'border-dim')}
        />
      )}
      {n.kind !== 'db' && (
        <div
          onPointerDown={(e) => onPortDown(n.id, e)}
          className="touch-none absolute -right-[17px] top-1/2 z-10 flex h-[34px] w-[34px] -translate-y-1/2 cursor-crosshair items-center justify-center"
          title="Drag to connect"
        >
          <span
            className={cn('block h-[18px] w-[18px] rounded-full border-2 border-ink transition-transform hover:scale-125', portHint && 'animate-ring')}
            style={{ background: def.color, boxShadow: `0 0 12px ${def.color}` }}
          />
        </div>
      )}
    </div>
  );
}
