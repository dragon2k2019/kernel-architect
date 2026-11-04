import { useCallback, useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import { NODE_DEFS, type Kind, type Level } from '../game/content';
import { BOARD_H, BOARD_W, NODE_H, NODE_W, Sim } from '../game/sim';
import { coach } from '../game/coach';
import { drawPackets } from '../game/draw';
import { Board, type Hand, type Wiring } from './Board';
import { TopBar } from './TopBar';
import { Tray } from './Tray';
import { Intro, Result } from './Overlays';
import { cn } from '../utils/cn';

const STEP = 1 / 30;

interface Props {
  level: Level;
  best: number;
  hasNext: boolean;
  onFinish: (sim: Sim) => void;
  onNext: () => void;
  onRetry: () => void;
  onMenu: () => void;
}

export function Play({ level, best, hasNext, onFinish, onNext, onRetry, onMenu }: Props) {
  const simRef = useRef<Sim>(null as unknown as Sim);
  if (!simRef.current) simRef.current = new Sim(level);
  const sim = simRef.current;

  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const [phase, setPhase] = useState<'intro' | 'play' | 'result'>('intro');
  const [speed, setSpeed] = useState(1);
  const [showLog, setShowLog] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1100);
  const [selected, setSelected] = useState<number | null>(null);
  const [hand, setHandState] = useState<Hand | null>(null);
  const [wiring, setWiringState] = useState<Wiring | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handRef = useRef<Hand | null>(null);
  const wiringRef = useRef<Wiring | null>(null);
  const phaseRef = useRef(phase);
  const speedRef = useRef(speed);
  const finished = useRef(false);
  phaseRef.current = phase;
  speedRef.current = speed;

  const setHand = (h: Hand | null) => { handRef.current = h; setHandState(h); };
  const setWiring = (w: Wiring | null) => { wiringRef.current = w; setWiringState(w); };

  const say = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToast({ id, text });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 2400);
  }, []);

  // ---------- main loop ----------
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (sim.status === 'running' && phaseRef.current === 'play') {
        acc += dt * speedRef.current;
        let n = 0;
        while (acc >= STEP && n < 16 && sim.status === 'running') { sim.step(STEP); acc -= STEP; n++; }
        if (n >= 16) acc = 0;
      }
      if (canvasRef.current) drawPackets(canvasRef.current, sim);
      if (++frame % 3 === 0) setTick((t) => t + 1);
      if ((sim.status === 'won' || sim.status === 'lost') && !finished.current) {
        finished.current = true;
        setTick((t) => t + 1);
        onFinish(sim);
        timer = setTimeout(() => setPhase('result'), 1000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- helpers ----------
  const toBoard = (cx: number, cy: number) => {
    const el = boardRef.current;
    if (!el) return { x: 0, y: 0, inside: false };
    const r = el.getBoundingClientRect();
    const s = r.width / BOARD_W;
    const x = (cx - r.left) / s;
    const y = (cy - r.top) / s;
    return { x, y, inside: x >= 0 && y >= 0 && x <= BOARD_W && y <= BOARD_H };
  };

  const hitNode = (x: number, y: number): number | null => {
    let best: { id: number; d: number } | null = null;
    for (const n of sim.nodes) {
      const m = 14;
      if (x >= n.x - m && x <= n.x + NODE_W + m && y >= n.y - m && y <= n.y + NODE_H + m) {
        const d = Math.hypot(x - (n.x + NODE_W / 2), y - (n.y + NODE_H / 2));
        if (!best || d < best.d) best = { id: n.id, d };
      }
    }
    return best ? best.id : null;
  };

  const placeAt = (kind: Kind, x: number, y: number): boolean => {
    const r = sim.place(kind, x - NODE_W / 2, y - NODE_H / 2);
    if (!r.ok) { say(r.reason ?? "Can't place that"); return false; }
    bump();
    return true;
  };

  const connect = (from: number, to: number) => {
    const r = sim.wire(from, to);
    if (!r.ok) say(r.reason ?? "Can't connect");
    bump();
  };

  const armTool = (kind: Kind) => {
    if (sim.cash < NODE_DEFS[kind].cost) { say(`Not enough $ for a ${NODE_DEFS[kind].label}`); return; }
    setSelected(null);
    setWiring(null);
    setHand(handRef.current?.kind === kind && !handRef.current.dragging ? null : { kind, x: null, y: null, dragging: false });
  };

  const toggleGo = () => {
    if (phaseRef.current !== 'play') return;
    if (sim.status === 'running') sim.pause(); else sim.go();
    setHand(null);
    setWiring(null);
    bump();
  };

  // ---------- gestures ----------
  const onToolDown = (kind: Kind, e: RPE) => {
    e.preventDefault();
    if (sim.cash < NODE_DEFS[kind].cost) { say(`Not enough $ for a ${NODE_DEFS[kind].label}`); return; }
    const sx = e.clientX; const sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) moved = true;
      if (moved) {
        const b = toBoard(ev.clientX, ev.clientY);
        setHand({ kind, x: b.inside ? b.x : null, y: b.inside ? b.y : null, dragging: true });
      }
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (moved) {
        const b = toBoard(ev.clientX, ev.clientY);
        if (b.inside) placeAt(kind, b.x, b.y);
        setHand(null);
      } else armTool(kind);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onBoardMove = (e: RPE) => {
    const h = handRef.current;
    if (h && !h.dragging) {
      const b = toBoard(e.clientX, e.clientY);
      setHand({ ...h, x: b.x, y: b.y });
    }
    const w = wiringRef.current;
    if (w?.armed) {
      const b = toBoard(e.clientX, e.clientY);
      setWiring({ ...w, x: b.x, y: b.y });
    }
  };

  const onBoardDown = (e: RPE) => {
    if (phaseRef.current !== 'play') return;
    const b = toBoard(e.clientX, e.clientY);
    const h = handRef.current;
    if (h && !h.dragging) {
      const ok = placeAt(h.kind, b.x, b.y);
      if (!ok || sim.cash < NODE_DEFS[h.kind].cost) setHand(null);
      return;
    }
    if (wiringRef.current?.armed) { setWiring(null); return; }
    setSelected(null);
  };

  const onNodeDown = (id: number, e: RPE) => {
    e.stopPropagation();
    if (phaseRef.current !== 'play') return;
    const b0 = toBoard(e.clientX, e.clientY);
    const h = handRef.current;
    if (h && !h.dragging) {
      const ok = placeAt(h.kind, b0.x, b0.y);
      if (!ok || sim.cash < NODE_DEFS[h.kind].cost) setHand(null);
      return;
    }
    const w = wiringRef.current;
    if (w?.armed) {
      if (w.from !== id) connect(w.from, id);
      setWiring(null);
      return;
    }
    const n = sim.node(id);
    if (!n) return;
    if (n.kind === 'internet') { setSelected(null); return; }
    e.preventDefault();
    const offX = b0.x - n.x; const offY = b0.y - n.y;
    const sx = e.clientX; const sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) moved = true;
      if (moved) {
        const b = toBoard(ev.clientX, ev.clientY);
        sim.move(id, b.x - offX, b.y - offY);
        bump();
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setSelected((s) => (!moved && s === id ? null : id));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onPortDown = (id: number, e: RPE) => {
    e.stopPropagation();
    e.preventDefault();
    if (phaseRef.current !== 'play') return;
    setHand(null);
    setSelected(null);
    const sx = e.clientX; const sy = e.clientY;
    let moved = false;
    const b0 = toBoard(sx, sy);
    setWiring({ from: id, x: b0.x, y: b0.y, armed: false, dragging: true });
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) moved = true;
      const b = toBoard(ev.clientX, ev.clientY);
      setWiring({ from: id, x: b.x, y: b.y, armed: false, dragging: true });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const b = toBoard(ev.clientX, ev.clientY);
      if (moved) {
        const t = hitNode(b.x, b.y);
        if (t !== null && t !== id) connect(id, t);
        setWiring(null);
      } else {
        // a simple click: stay armed, next click on a box connects
        setWiring({ from: id, x: b.x, y: b.y, armed: true, dragging: false });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const onCut = (id: number) => { sim.cut(id); bump(); };
  const onSell = (id: number) => { sim.remove(id); setSelected(null); bump(); };

  // ---------- keyboard ----------
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (phaseRef.current === 'intro') {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPhase('play'); }
      return;
    }
    if (phaseRef.current !== 'play') return;
    if (e.key === ' ') { e.preventDefault(); toggleGo(); return; }
    if (e.key === 'Escape') { setHand(null); setWiring(null); setSelected(null); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null) { onSell(selected); return; }
    if (e.key === 'l' || e.key === 'L') { setShowLog((s) => !s); return; }
    const tool = level.tools.find((k) => NODE_DEFS[k].key === e.key);
    if (tool) armTool(tool);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ---------- render ----------
  void tick;
  const c = coach(sim);
  const msg = hand && !hand.dragging
    ? { text: `Placing ${NODE_DEFS[hand.kind].icon} ${NODE_DEFS[hand.kind].label}. Click the board. (Esc to stop)`, tone: 'info' as const }
    : wiring?.armed
      ? { text: 'Now click the box to connect to. (Esc to cancel)', tone: 'info' as const }
      : c;
  const tone = { info: 'text-fg', warn: 'text-warn', bad: 'text-bad', good: 'text-ok' }[msg.tone];
  const showTarget = !hand && !wiring ? c.target : undefined;

  return (
    <div className="relative flex h-full flex-col bg-ink">
      <TopBar
        sim={sim} speed={speed} showLog={showLog} goHint={!!showTarget?.go}
        onSpeed={setSpeed} onToggleLog={() => setShowLog((s) => !s)} onBack={onMenu} onGo={toggleGo}
      />
      <Board
        sim={sim} tick={tick} boardRef={boardRef} canvasRef={canvasRef}
        selected={selected} hand={hand} wiring={wiring} target={showTarget} showLog={showLog}
        onBoardDown={onBoardDown} onBoardMove={onBoardMove}
        onNodeDown={onNodeDown} onPortDown={onPortDown} onCut={onCut} onSell={onSell}
      />

      <div className="relative z-10 border-t border-line bg-panel/95 px-3 pb-3 pt-2.5">
        <div className="mx-auto mb-1 flex max-w-4xl items-center gap-2 px-1 text-[15px] font-bold">
          <span className="text-dim">›</span>
          <span key={msg.text} className={cn('animate-slidein', tone)}>{msg.text}</span>
          <span className="animate-blink text-dim">▌</span>
        </div>
        <Tray
          tools={level.tools} cash={sim.cash} armed={hand ? hand.kind : null}
          hint={showTarget?.tool} onDown={onToolDown}
        />
      </div>

      {toast && (
        <div key={toast.id} className="pointer-events-none absolute bottom-40 left-1/2 z-30 -translate-x-1/2 animate-pop rounded-xl border border-bad/60 bg-panel px-4 py-2 text-sm font-bold text-bad shadow-xl">
          {toast.text}
        </div>
      )}

      <div className="absolute inset-0 z-50 hidden flex-col items-center justify-center gap-3 bg-ink text-center portrait:max-md:flex">
        <div className="text-5xl">📱↻</div>
        <div className="text-lg font-bold">Rotate your phone</div>
        <div className="text-xs text-dim">The board needs a wide screen.</div>
      </div>

      {phase === 'intro' && <Intro level={level} onStart={() => setPhase('play')} onBack={onMenu} />}
      {phase === 'result' && (
        <Result sim={sim} best={best} hasNext={hasNext} onNext={onNext} onRetry={onRetry} onMenu={onMenu} />
      )}
    </div>
  );
}
