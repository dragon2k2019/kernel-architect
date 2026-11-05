import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPE, type RefObject } from 'react';
import { NODE_DEFS, REQ, TUNING, type Kind } from '../game/content';
import { BOARD_H, BOARD_W, NODE_H, NODE_W, Sim, type SNode } from '../game/sim';
import { inPort, outPort, wirePath } from '../game/geom';
import type { CoachTarget } from '../game/coach';
import { cn } from '../utils/cn';
import { NodeCard2, useHoverCard } from './HoverCard';
import { Face, Icon, NodeIcon, ReqDot, type Mood } from './icons';

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
  quake: boolean;
  onBoardDown: (e: RPE) => void;
  onBoardMove: (e: RPE) => void;
  onNodeDown: (id: number, e: RPE) => void;
  onPortDown: (id: number, e: RPE) => void;
  onCut: (id: number) => void;
  onSell: (id: number) => void;
  onUpgrade: (id: number) => void;
  comboPulse: number;
}

export function moodOf(n: SNode): Mood {
  const def = NODE_DEFS[n.kind];
  if (n.down > 0) return 'dead';
  if (!def.queue) return 'happy';
  const q = n.queue.length / def.queue;
  if (q >= 0.75) return 'hot';
  if (q >= 0.4) return 'sweat';
  return n.cur || q > 0 ? 'happy' : 'sleep';
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
    <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden bg-ink">
      <div className={cn('absolute inset-0', p.quake && 'animate-quake')}>
      <div
        className="absolute left-1/2 top-1/2"
        style={{ width: BOARD_W * scale, height: BOARD_H * scale, transform: 'translate(-50%, -50%)' }}
      >
        <div
          ref={boardRef}
          data-tut="board"
          onPointerDown={p.onBoardDown}
          onPointerMove={p.onBoardMove}
          className={cn(
            'board-bg touch-none absolute left-0 top-0 origin-top-left overflow-hidden rounded-xl border border-line shadow-[0_0_70px_rgba(122,162,247,0.1)]',
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
              const col = dead ? '#ff6b8b' : NODE_DEFS[a.kind].color;
              return (
                <g key={w.id}>
                  <path d={d} fill="none" stroke="#252941" strokeWidth={6} strokeLinecap="round" />
                  <path
                    className={cn(running && 'animate-flow')}
                    d={d} fill="none" stroke={col} strokeOpacity={0.9} strokeWidth={3} strokeLinecap="round" strokeDasharray="2 10"
                  />
                  <path
                    d={d} fill="none" stroke="transparent" strokeWidth={22}
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
                fill="none" stroke="#7ee787" strokeWidth={3} strokeDasharray="7 6" strokeLinecap="round"
              />
            )}
          </svg>

          {/* packets */}
          <canvas ref={canvasRef} className="pointer-events-none absolute left-0 top-0" style={{ width: BOARD_W, height: BOARD_H }} />

          {/* nodes */}
          {sim.nodes.map((n) => (
            <NodeWindow
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
              className={cn('pointer-events-none absolute flex flex-col items-center justify-center rounded-lg border-2 border-dashed', ghost.ok ? 'border-ok bg-ok/10' : 'border-bad bg-bad/10')}
              style={{ left: ghost.x, top: ghost.y, width: NODE_W, height: NODE_H }}
            >
              <NodeIcon kind={ghost.kind} size={30} color={NODE_DEFS[ghost.kind].color} />
              <span className="mt-1 text-[10px] text-dim">{ghost.ok ? 'drop here' : 'no room / no cash'}</span>
            </div>
          )}

          {/* sell popover */}
          {sel && sel.kind !== 'internet' && !p.wiring && (
            <div
              className="absolute z-20 -translate-x-1/2"
              style={{ left: sel.x + NODE_W / 2, top: Math.max(4, sel.y - 40) }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex gap-1.5">
                {(sel.kind === 'server' || sel.kind === 'db') && (() => {
                  const cost = sim.upgradeCost(sel.id);
                  const afford = cost !== null && sim.cash >= cost;
                  return (
                    <button
                      onClick={() => p.onUpgrade(sel.id)}
                      disabled={cost === null}
                      title="Overclock (U): faster and runs cooler"
                      className={cn(
                        'flex items-center gap-1.5 whitespace-nowrap rounded-lg border bg-panel px-3 py-1.5 text-xs font-bold shadow-lg',
                        cost === null ? 'border-line text-dim' : afford ? 'border-gold/70 text-gold hover:bg-gold hover:text-ink' : 'border-line text-dim',
                      )}
                    >
                      <Icon name="upgrade" size={14} /> {cost === null ? 'MAX' : `Overclock $${cost}`}
                    </button>
                  );
                })()}
                <button
                  onClick={() => p.onSell(sel.id)}
                  className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-bad/60 bg-panel px-3 py-1.5 text-xs font-bold text-bad shadow-lg hover:bg-bad hover:text-ink"
                >
                  <Icon name="trash" size={14} /> Sell +${sim.sellValue(sel.id)}
                </button>
              </div>
            </div>
          )}

          {/* floating +$ / 503 */}
          {sim.fx.map((f) => (
            <div
              key={f.id}
              className="pointer-events-none absolute z-10 animate-floatup text-[13px] font-extrabold"
              style={{ left: f.x, top: f.y, color: f.color, textShadow: '0 1px 6px #000' }}
            >
              {f.text}
            </div>
          ))}

          {/* legend */}
          <div className="pointer-events-none absolute bottom-3 left-3 flex gap-3 rounded-lg border border-line/60 bg-ink/70 px-2.5 py-1.5 text-[11px] text-dim backdrop-blur">
            <span className="flex items-center gap-1.5"><ReqDot type="page" color={REQ.page.color} size={9} /> page</span>
            <span className="flex items-center gap-1.5"><ReqDot type="data" color={REQ.data.color} size={9} /> data</span>
            {(sim.level.vipShare ?? 0) > 0 && <span className="flex items-center gap-1.5"><ReqDot type="vip" color={REQ.vip.color} size={9} /> VIP</span>}
            {(sim.level.botShare ?? 0) > 0 || sim.level.endless ? <span className="flex items-center gap-1.5"><ReqDot type="bot" color={REQ.bot.color} size={9} /> bot</span> : null}
          </div>

          {/* combo meter */}
          <ComboHud sim={sim} pulse={p.comboPulse} />

          {/* event banner */}
          {sim.banner && (
            <div className="pointer-events-none absolute left-0 right-0 top-3 z-30 flex justify-center">
              <div
                key={sim.banner.text}
                className={cn(
                  'flex animate-shake items-center gap-2 rounded-xl border px-5 py-2 text-sm font-extrabold shadow-xl backdrop-blur',
                  sim.banner.kind === 'bad' ? 'border-bad bg-bad/20 text-bad' : 'border-warn bg-warn/15 text-warn',
                )}
              >
                <Icon name={sim.banner.kind === 'bad' ? 'skull' : 'warn'} size={16} />
                {sim.banner.text}
              </div>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function NodeWindow({ sim, n, selected, wiring, target, onDown, onPortDown }: {
  sim: Sim; n: SNode; selected: boolean; wiring: Wiring | null; target?: CoachTarget;
  onDown: Props['onNodeDown']; onPortDown: Props['onPortDown'];
}) {
  const def = NODE_DEFS[n.kind];
  const hv = useHoverCard();
  const down = n.down > 0;
  const q = def.queue ? n.queue.length / def.queue : 0;
  const isTarget = target?.node === n.id;
  const wiringValid = wiring ? wiring.from !== n.id && sim.canWire(wiring.from, n.id).ok : false;
  const dimmed = wiring && wiring.from !== n.id && !wiringValid;
  const portHint = target?.port === n.id && !wiring;
  const mood: Mood | null = n.kind === 'internet' ? null : moodOf(n);
  const dot = down ? '#ff6b8b' : q >= 0.75 ? '#ff6b8b' : q >= 0.4 ? '#ffc857' : '#7ee787';

  return (
    <div
      data-node={n.id}
      data-tut={`node-${n.kind}`}
      {...hv.bind}
      onPointerDown={(e) => { hv.bind.onPointerDown(); onDown(n.id, e); }}
      className={cn(
        'touch-none absolute flex flex-col overflow-visible rounded-lg border-2 bg-panel transition-[opacity,filter] duration-150',
        n.kind !== 'internet' && 'cursor-grab active:cursor-grabbing',
        down && 'opacity-60 grayscale',
        dimmed && 'opacity-40',
        q >= 0.75 && !down && 'animate-alarm',
        isTarget && 'animate-ring',
      )}
      style={{
        left: n.x, top: n.y, width: NODE_W, height: NODE_H,
        borderColor: down ? '#ff6b8b' : wiringValid ? '#7ee787' : def.color + 'cc',
        background: `linear-gradient(165deg, ${def.color}1c, #151722 60%)`,
        boxShadow: selected
          ? `0 0 0 3px ${def.color}55, 0 0 28px ${def.color}66`
          : wiringValid ? '0 0 0 4px rgba(126,231,135,0.35)' : '0 8px 22px rgba(0,0,0,0.5)',
      }}
    >
      {/* mini title bar */}
      <div className="flex h-[17px] shrink-0 items-center gap-1 rounded-t-[5px] border-b border-white/5 bg-black/30 px-1.5">
        <span className="h-[6px] w-[6px] rounded-full" style={{ background: dot, boxShadow: `0 0 6px ${dot}` }} />
        <span className="h-[6px] w-[6px] rounded-full bg-white/15" />
        <span className="h-[6px] w-[6px] rounded-full bg-white/15" />
        <span className="ml-1 min-w-0 flex-1 truncate text-[9px] leading-none text-dim">{down ? `reboot ${Math.ceil(n.down)}s` : n.hot ? 'THROTTLED' : n.name}</span>
        {n.lvl > 1 && <span className="flex gap-px text-gold">{Array.from({ length: n.lvl - 1 }, (_, i) => <Icon key={i} name="bolt" size={9} strokeWidth={2.4} />)}</span>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-2 pb-1.5 pt-1">
        <div className="flex items-center justify-between leading-none">
          <NodeIcon kind={n.kind} size={26} color={def.color} />
          {mood && <Face mood={mood} size={20} />}
        </div>
        <div className="mt-1 truncate text-[11px] font-bold leading-tight text-fg">{def.label}</div>

        <div className="mt-auto flex h-[10px] items-center gap-[3px]">
          {def.queue > 0 ? (
            <>
              <span
                className={cn('h-2.5 w-3 shrink-0 rounded-[3px]', n.cur && 'animate-pulse')}
                style={{ background: n.cur ? REQ[n.cur.type].color : '#2a2e45' }}
              />
              <span className="mx-px h-2.5 w-px shrink-0 bg-line" />
              {Array.from({ length: def.queue }, (_, i) => (
                <span key={i} className="h-2 flex-1 rounded-[2px]" style={{ background: n.queue[i] ? REQ[n.queue[i].type].color : '#2a2e45' }} />
              ))}
            </>
          ) : n.kind === 'internet' ? (
            <span className="text-[10px] text-cyan">{sim.status === 'running' ? `${sim.traffic.toFixed(1)} req/s` : 'visitors'}</span>
          ) : (
            <span className="text-[10px] text-dim">handled {n.handled}</span>
          )}
        </div>
      </div>

      {/* heat gauge */}
      {def.rate > 0 && !down && n.heat > 0.04 && (
        <div className="pointer-events-none absolute -bottom-[9px] left-1 right-1 h-[5px] overflow-hidden rounded-full bg-black/60">
          <div
            className={cn('h-full rounded-full', n.hot && 'animate-pulse')}
            style={{ width: `${Math.min(100, n.heat * 100)}%`, background: n.hot ? '#ff4d6d' : n.heat > 0.7 ? '#ff9e64' : '#ffd34d' }}
          />
        </div>
      )}
      {/* click me! */}
      {sim.status === 'running' && (down || (def.rate > 0 && n.heat > 0.5)) && (
        <div className="pointer-events-none absolute -top-[26px] left-1/2 z-20 -translate-x-1/2 animate-bob whitespace-nowrap rounded-md bg-gold px-1.5 py-0.5 text-[10px] font-black text-ink shadow-lg">
          {down ? 'CLICK TO REBOOT!' : 'CLICK TO COOL!'}
        </div>
      )}
      {n.kind !== 'internet' && (
        <span
          className={cn('absolute -left-[7px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 bg-ink', wiringValid ? 'animate-ring border-ok' : 'border-dim')}
        />
      )}
      {n.kind !== 'db' && (
        <div
          data-tut={`port-${n.kind}`}
          onPointerDown={(e) => { hv.bind.onPointerDown(); onPortDown(n.id, e); }}
          className="touch-none absolute -right-[17px] top-1/2 z-10 flex h-[34px] w-[34px] -translate-y-1/2 cursor-crosshair items-center justify-center"
          title="Drag to connect"
        >
          <span
            className={cn('relative block h-[18px] w-[18px] rounded-full border-2 border-ink transition-transform hover:scale-125', portHint && 'animate-ring')}
            style={{ background: def.color, boxShadow: `0 0 12px ${def.color}` }}
          />
        </div>
      )}
      <NodeCard2 node={n} rect={hv.rect} ins={sim.ins(n.id).length} outs={sim.outs(n.id).length} />
    </div>
  );
}

/** Combo meter: grows with every success, charges toward the next tier, and shakes when you are on fire. */
function ComboHud({ sim, pulse }: { sim: Sim; pulse: number }) {
  if (sim.status !== 'running' && sim.status !== 'paused') return null;
  if (sim.combo < 3) return null;
  const tier = sim.comboTier;
  const maxed = tier >= TUNING.comboMaxTier;
  const into = maxed ? 1 : (sim.combo % TUNING.comboStep) / TUNING.comboStep;
  const hue = ['#7dcfff', '#9ece6a', '#ffd34d', '#ff9e64', '#ff5ccf', '#ff4d6d'][tier];
  const word = ['', 'HOT', 'ON FIRE', 'BLAZING', 'UNSTOPPABLE', 'OVERDRIVE'][tier];
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-20 text-right">
      <div key={pulse} className={cn('inline-block origin-right rounded-xl border bg-ink/80 px-3 py-1.5 backdrop-blur', pulse > 0 && 'animate-pop')} style={{ borderColor: hue + '99', boxShadow: `0 0 ${10 + tier * 8}px ${hue}66` }}>
        <div className="flex items-baseline justify-end gap-2 leading-none">
          {word && <span className="text-[10px] font-black tracking-[0.2em]" style={{ color: hue }}>{word}</span>}
          <span className={cn('font-black tabular-nums', tier >= 3 && 'animate-shake')} style={{ color: hue, fontSize: 20 + tier * 3 }}>{sim.combo}</span>
          <span className="text-[10px] font-bold text-dim">combo</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full transition-[width] duration-150" style={{ width: `${into * 100}%`, background: hue }} />
          </div>
          <b className="text-[11px]" style={{ color: hue }}>x{sim.comboMult.toFixed(2)}</b>
        </div>
      </div>
    </div>
  );
}
