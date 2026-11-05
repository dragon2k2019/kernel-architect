import { useCallback, useEffect, useRef, useState, type PointerEvent as RPE } from 'react';
import { NODE_DEFS, TUNING, type Kind, type Level } from '../game/content';
import { BOARD_H, BOARD_W, NODE_H, NODE_W, Sim } from '../game/sim';
import { coach } from '../game/coach';
import { drawPackets } from '../game/draw';
import { sfx } from '../game/sfx';
import { fx } from '../game/particles';
import { TUTORIALS, type TutStep } from '../game/tutorial';
import { Board, type Hand, type Wiring } from './Board';
import { TopBar } from './TopBar';
import { Tray } from './Tray';
import { TutorialLayer } from './TutorialLayer';
import { BottomPanel, type PanelTab } from './BottomPanel';
import { Intro, Result } from './Overlays';
import { Dots, Tab } from './Chrome';
import { Icon, type IconName } from './icons';
import { SoundToggle } from './SoundToggle';
import { cn } from '../utils/cn';

const STEP = 1 / 30;
const MILESTONES = [0.25, 0.5, 0.75];

interface Props {
  level: Level;
  best: number;
  bank: number;
  hasNext: boolean;
  onFinish: (sim: Sim) => void;
  onNext: () => void;
  onRetry: () => void;
  onMenu: () => void;
  /** Show the hands-on tutorial for this level right away. */
  tutorial: boolean;
  onTutDone: () => void;
}

// The wallet bounces when a coin lands. Done with the Web Animations API so it never triggers a React render
// (a coin shower used to re-render the whole game screen once per coin).
let lastPulse = 0;
function pulseWallet() {
  const now = performance.now();
  if (now - lastPulse < 120) return;
  lastPulse = now;
  document.getElementById('wallet')?.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
    { duration: 260, easing: 'ease-out' },
  );
}

const fileName = (l: Level) =>
  `${String(l.n).padStart(2, '0')}_${l.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}.arch`;

export function Play({ level, best, bank, hasNext, onFinish, onNext, onRetry, onMenu, tutorial, onTutDone }: Props) {
  const simRef = useRef<Sim>(null as unknown as Sim);
  if (!simRef.current) simRef.current = new Sim(level);
  const sim = simRef.current;
  // what the player had before this run, so the result screen can celebrate records and count up the wallet
  const startBest = useRef(best);
  const startBank = useRef(bank);

  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);
  const [phase, setPhase] = useState<'intro' | 'play' | 'result'>('intro');
  const [speed, setSpeed] = useState(1);
  const [panelOpen, setPanelOpen] = useState(() => typeof window !== 'undefined' && window.innerHeight >= 560);
  const [panelTab, setPanelTab] = useState<PanelTab>('terminal');
  const [selected, setSelected] = useState<number | null>(null);
  const [hand, setHandState] = useState<Hand | null>(null);
  const [wiring, setWiringState] = useState<Wiring | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; tone: 'bad' | 'good' } | null>(null);
  const steps = TUTORIALS[level.id];
  const [tutOn, setTutOn] = useState(tutorial && !!steps);
  const [tutRun, setTutRun] = useState(0); // bump to replay from the first card
  const tutRef = useRef<TutStep | null>(null);
  const [quake, setQuake] = useState(false);

  const boardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handRef = useRef<Hand | null>(null);
  const wiringRef = useRef<Wiring | null>(null);
  const phaseRef = useRef(phase);
  const speedRef = useRef(speed);
  const finished = useRef(false);
  const milestone = useRef(0);
  const endlessStep = useRef(0);
  const okTick = useRef(0);
  const musicOn = useRef(false);
  const lastCoin = useRef(0);
  const lastBlock = useRef(0);
  const [comboPulse, setComboPulse] = useState(0);
  phaseRef.current = phase;
  speedRef.current = speed;

  const setHand = (h: Hand | null) => { handRef.current = h; setHandState(h); };
  const setWiring = (w: Wiring | null) => { wiringRef.current = w; setWiringState(w); };

  const say = useCallback((text: string, tone: 'bad' | 'good' = 'bad') => {
    const id = Date.now() + Math.random();
    setToast({ id, text, tone });
    if (tone === 'bad') sfx.error();
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 2400);
  }, []);

  // board coordinates -> screen pixels (for particles)
  const toScreen = useCallback((bx: number, by: number) => {
    const el = boardRef.current;
    if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const r = el.getBoundingClientRect();
    const s = r.width / BOARD_W;
    return { x: r.left + bx * s, y: r.top + by * s };
  }, []);
  const walletPos = useCallback(() => {
    const r = document.getElementById('wallet')?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth - 80, y: 60 };
  }, []);

  // ---------- main loop ----------
  useEffect(() => {
    fx.onCoinArrive = () => { sfx.coin(Math.random() * 3); pulseWallet(); };
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const drain = () => {
      const evs = sim.evq;
      if (!evs.length) return;
      sim.evq = [];
      const now = performance.now();
      for (const e of evs) {
        switch (e.type) {
          case 'ok':
            okTick.current++;
            sfx.comboTick(sim.combo);
            if (okTick.current % 3 === 0 && now - lastCoin.current > 160) {
              lastCoin.current = now;
              const from = toScreen(e.x, e.y); const to = walletPos();
              fx.coinFly(from.x, from.y, to.x, to.y, e.data ? 2 : 1);
            }
            break;
          case 'fail': sfx.thud(); break;
          case 'vip': {
            sfx.vip();
            const s = toScreen(e.x, e.y); const w = walletPos();
            fx.sparks(s.x, s.y, '#fff27a', 30, 380); fx.ring(s.x, s.y, '#fff27a', 170, 0.7);
            fx.coinFly(s.x, s.y, w.x, w.y, 8);
            break;
          }
          case 'tier': {
            // delayed gratification: the sound charges for ~0.45s, the burst lands right on the chord
            sfx.comboTier(e.tier);
            const mult = 1 + TUNING.comboBonus * e.tier;
            setToast({ id: Date.now(), text: `COMBO x${e.combo}!  revenue x${mult.toFixed(2)}`, tone: 'good' });
            setTimeout(() => setToast((t) => (t && t.tone === 'good' ? null : t)), 2400);
            window.setTimeout(() => {
              const el = boardRef.current?.getBoundingClientRect();
              const cx = el ? el.left + el.width / 2 : window.innerWidth / 2;
              const cy = el ? el.bottom : window.innerHeight;
              fx.confetti(cx - 160, cy, -75, 30 + e.tier * 10, 0.8, 30);
              fx.confetti(cx + 160, cy, -105, 30 + e.tier * 10, 0.8, 30);
              const w = walletPos();
              fx.ring(w.x, w.y, '#ffd34d', 160 + e.tier * 30, 0.8);
              fx.sparks(w.x, w.y, '#ffd34d', 20 + e.tier * 6, 300);
              setComboPulse((k) => k + 1);
            }, 460);
            break;
          }
          case 'comboBreak':
            sfx.comboBreak(e.combo);
            setToast({ id: Date.now(), text: `Combo x${e.combo} lost!`, tone: 'bad' });
            setTimeout(() => setToast((t) => (t && t.tone === 'bad' ? null : t)), 1800);
            break;
          case 'block': {
            sfx.block();
            if (now - lastBlock.current > 140) { lastBlock.current = now; const s = toScreen(e.x, e.y); fx.sparks(s.x, s.y, '#2ac3de', 8, 180, 0); }
            break;
          }
          case 'leak': sfx.leak(); break;
          case 'overheat': { sfx.overheat(); const s = toScreen(e.x, e.y); fx.embers(s.x, s.y, 14); break; }
          case 'cooled': { sfx.cooled(); const s = toScreen(e.x, e.y); fx.sparks(s.x, s.y, '#7dcfff', 14, 200, 0); break; }
          case 'poke': {
            const prog = e.kind === 'reboot' ? 1 - e.left / TUNING.crashSeconds : 1 - e.left;
            sfx.poke(prog, e.kind);
            const s = toScreen(e.x, e.y);
            fx.sparks(s.x, s.y, e.kind === 'reboot' ? '#ffc857' : '#7dcfff', 8, 200, 0);
            break;
          }
          case 'upgrade': {
            sfx.upgrade(e.lvl);
            const s = toScreen(e.x, e.y);
            fx.sparks(s.x, s.y, '#ffd34d', 26, 320); fx.ring(s.x, s.y, '#ffd34d', 140, 0.6);
            break;
          }
          case 'ddos':
            sfx.ddos();
            setQuake(true); setTimeout(() => setQuake(false), 650);
            break;
          case 'crash': {
            sfx.crash();
            const s = toScreen(e.x, e.y);
            fx.embers(s.x, s.y, 36); fx.ring(s.x, s.y, '#ff6b8b', 220, 0.7);
            setQuake(true); setTimeout(() => setQuake(false), 650);
            break;
          }
          case 'spike': case 'warn': sfx.alarm(); break;
          case 'back': { sfx.reboot(); const s = toScreen(e.x, e.y); fx.sparks(s.x, s.y, '#7ee787', 20, 260); break; }
        }
      }
    };

    const checkMilestones = () => {
      const goal = sim.level.goal;
      let hit = false;
      if (goal) {
        const frac = sim.ok / goal;
        while (milestone.current < MILESTONES.length && frac >= MILESTONES[milestone.current] && frac < 1) {
          hit = true;
          setToast({ id: Date.now(), text: `Checkpoint! ${Math.round(MILESTONES[milestone.current] * 100)}% of visitors served`, tone: 'good' });
          milestone.current++;
        }
      } else {
        const step = Math.floor(sim.ok / 100);
        if (step > endlessStep.current) {
          endlessStep.current = step; hit = true;
          setToast({ id: Date.now(), text: `${step * 100} visitors served. Still online!`, tone: 'good' });
        }
      }
      if (hit) {
        sfx.milestone();
        const el = boardRef.current?.getBoundingClientRect();
        const cx = el ? el.left + el.width / 2 : window.innerWidth / 2;
        const cy = el ? el.bottom : window.innerHeight;
        fx.confetti(cx - 120, cy, -80, 36, 0.7, 30);
        fx.confetti(cx + 120, cy, -100, 36, 0.7, 30);
        setTimeout(() => setToast((t) => (t && t.tone === 'good' ? null : t)), 2200);
      }
    };

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      frame++;
      const ph = phaseRef.current;
      // Once the result screen is up the board is dead weight: stop simulating, drawing and re-rendering it,
      // so every bit of CPU/GPU goes to the celebration.
      if (ph === 'result') { if (musicOn.current) { musicOn.current = false; sfx.musicStop(); } return; }
      const live = sim.status === 'running' && ph === 'play';
      const frozen = !!tutRef.current?.freeze;
      const wantMusic = live && !frozen;
      if (wantMusic !== musicOn.current) { musicOn.current = wantMusic; if (wantMusic) sfx.musicStart(); else sfx.musicStop(); }
      if (wantMusic) sfx.setMood({ tier: sim.comboTier, danger: sim.happy < 45 ? 1 : 0, hype: sim.spiking });
      if (live && !frozen) {
        acc += dt * speedRef.current;
        let n = 0;
        while (acc >= STEP && n < 16 && sim.status === 'running') { sim.step(STEP); acc -= STEP; n++; }
        if (n >= 16) acc = 0;
        drain();
        checkMilestones();
      }
      // packets only move while running; when idle just refresh occasionally (covers canvas resizes)
      if (ph === 'play' && canvasRef.current && ((live && !frozen) || frame % 20 === 0)) drawPackets(canvasRef.current, sim);
      if (live && !frozen && frame % 3 === 0) setTick((t) => t + 1);
      if ((sim.status === 'won' || sim.status === 'lost') && !finished.current) {
        finished.current = true;
        if (canvasRef.current) drawPackets(canvasRef.current, sim);
        setTick((t) => t + 1);
        onFinish(sim);
        timer = setTimeout(() => setPhase('result'), 900);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); if (timer) clearTimeout(timer); sfx.musicStop(); fx.onCoinArrive = null; fx.clear(); };
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
    if (!r.ok || !r.node) { say(r.reason ?? "Can't place that"); return false; }
    const s = toScreen(r.node.x + NODE_W / 2, r.node.y + NODE_H / 2);
    sfx.place();
    fx.sparks(s.x, s.y, NODE_DEFS[kind].color, 20, 260);
    fx.ring(s.x, s.y, NODE_DEFS[kind].color, 110, 0.5);
    bump();
    return true;
  };

  const connect = (from: number, to: number) => {
    const r = sim.wire(from, to);
    if (!r.ok) say(r.reason ?? "Can't connect");
    else {
      const a = sim.node(from); const b = sim.node(to);
      if (a && b) {
        const s = toScreen((a.x + NODE_W + b.x) / 2, (a.y + b.y + NODE_H) / 2);
        fx.sparks(s.x, s.y, NODE_DEFS[a.kind].color, 14, 200, 0);
      }
      sfx.connect();
    }
    bump();
  };

  const armTool = (kind: Kind) => {
    if (sim.cash < NODE_DEFS[kind].cost) { say(`Not enough cash for a ${NODE_DEFS[kind].label}`); return; }
    sfx.click();
    setSelected(null);
    setWiring(null);
    setHand(handRef.current?.kind === kind && !handRef.current.dragging ? null : { kind, x: null, y: null, dragging: false });
  };

  const toggleGo = () => {
    if (phaseRef.current !== 'play') return;
    if (sim.status === 'running') { sim.pause(); sfx.pause(); }
    else { sim.go(); sfx.go(); }
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
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) { moved = true; sfx.pickup(); }
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
      // clicking a crashed or overheating box repairs it instead of selecting it
      if (!moved && sim.status === 'running' && (n.down > 0 || n.heat > 0.5) && sim.poke(id)) { bump(); return; }
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

  const onUpgrade = (id: number) => {
    const r = sim.upgrade(id);
    if (!r.ok) { say(r.reason ?? "Can't upgrade"); return; }
    // events normally drain while running; give instant feedback while planning too
    sim.evq = sim.evq.filter((e) => e.type !== 'upgrade');
    const n = sim.node(id);
    if (n) {
      const s = toScreen(n.x + NODE_W / 2, n.y + NODE_H / 2);
      sfx.upgrade(n.lvl);
      fx.sparks(s.x, s.y, '#ffd34d', 26, 320); fx.ring(s.x, s.y, '#ffd34d', 140, 0.6);
    }
    bump();
  };
  const onCut = (id: number) => { sim.cut(id); sfx.cut(); bump(); };
  const onSell = (id: number) => {
    const n = sim.node(id);
    const value = sim.sellValue(id);
    if (n) {
      const from = toScreen(n.x + NODE_W / 2, n.y + NODE_H / 2);
      const to = walletPos();
      fx.coinFly(from.x, from.y, to.x, to.y, Math.min(6, 2 + Math.floor(value / 20)));
      fx.sparks(from.x, from.y, '#ffd34d', 14, 220);
    }
    sim.remove(id);
    sfx.sell();
    setSelected(null);
    bump();
  };

  // the Help buttons replay this level's tutorial
  const replay = () => {
    if (!steps || phaseRef.current !== 'play') return;
    setHand(null); setWiring(null);
    if (sim.status === 'running') { sim.pause(); }
    setTutRun((k) => k + 1); setTutOn(true); bump();
  };
  const endTutorial = useCallback(() => {
    tutRef.current = null;
    setTutOn(false);
    onTutDone();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- keyboard ----------
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    if (document.querySelector('[data-modal]')) return;
    // tutorial steps are locked: only the keys the current step asks for work
    const ts = tutRef.current;
    if (ts && phaseRef.current === 'play') {
      if (ts.keys?.includes(e.key)) { e.preventDefault(); if (e.key === ' ') toggleGo(); }
      return;
    }
    if (phaseRef.current === 'intro') {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sfx.click(); setPhase('play'); }
      return;
    }
    if (phaseRef.current !== 'play') return;
    if (e.key === ' ') { e.preventDefault(); toggleGo(); return; }
    if (e.key === 'Escape') { setHand(null); setWiring(null); setSelected(null); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null) { onSell(selected); return; }
    if (e.key === 'l' || e.key === 'L') { setPanelOpen((s) => !s); return; }
    if ((e.key === 'u' || e.key === 'U') && selected !== null) { onUpgrade(selected); return; }
    if (e.key === '?' || e.key === 'h' || e.key === 'H') { replay(); return; }
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
    ? { text: `Placing ${NODE_DEFS[hand.kind].label}. Click the board. (Esc to stop)`, tone: 'info' as const }
    : wiring?.armed
      ? { text: 'Now click the box to connect to. (Esc to cancel)', tone: 'info' as const }
      : c;
  const showTarget = !hand && !wiring ? c.target : undefined;

  const trouble = sim.status === 'running' && (sim.spiking || sim.uptime < 0.95);
  const barColor = sim.status === 'won' ? '#2d7a49' : sim.status === 'lost' ? '#8f2a45' : trouble ? '#8f2a45' : sim.status === 'running' ? '#a24a1a' : '#3b4a8f';
  const state = sim.status === 'planning' ? 'planning' : sim.status === 'running' ? (sim.spiking ? 'traffic spike' : 'running') : sim.status;

  const act = (name: IconName, title: string, onClick: () => void, active = false) => (
    <button
      title={title}
      onClick={onClick}
      className={cn('relative flex h-11 w-11 items-center justify-center text-dim transition-colors hover:text-fg', active && 'text-fg')}
    >
      {active && <span className="absolute inset-y-2 left-0 w-[2px] rounded bg-gold" />}
      <Icon name={name} size={20} />
    </button>
  );

  return (
    <div className="relative flex h-full flex-col bg-ink">
      {/* window title bar */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-ink2 px-3 [@media(max-height:520px)]:hidden">
        <Dots onClose={onMenu} />
        <div className="flex-1 truncate text-center text-[11px] text-dim">{fileName(level)} - kernel-architect</div>
        <button onClick={replay} title="Replay tutorial (?)" className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-dim hover:bg-line hover:text-fg">
          <Icon name="help" size={15} /><span className="hidden sm:inline">Tutorial</span>
        </button>
        <SoundToggle />
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* activity bar */}
        <div className="hidden w-11 shrink-0 flex-col items-center border-r border-line bg-[#0a0b13] md:flex">
          {act('back', 'Back to menu', onMenu)}
          {act('folder', 'Components', () => {}, true)}
          {act('terminal', 'Toggle terminal (L)', () => setPanelOpen((o) => !o), panelOpen)}
          {act('help', 'Replay tutorial (?)', replay)}
        </div>

        <Tray
          tools={level.tools} cash={sim.cash} armed={hand ? hand.kind : null}
          hint={showTarget?.tool} onDown={onToolDown}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 overflow-hidden border-b border-line bg-ink2">
            <Tab icon={level.icon} label={fileName(level)} active dirty={sim.status === 'planning'} color="#ffd34d" />
            {steps && <Tab icon="book" label="tutorial.md" onClick={replay} color="#ffc857" />}
            <div className="ml-auto hidden items-center gap-3 px-3 text-[10.5px] text-dim lg:flex">
              <span className="flex items-center gap-1"><span className="kbd">Space</span> run</span>
              <span className="flex items-center gap-1"><span className="kbd">U</span> overclock</span>
              <span className="flex items-center gap-1"><span className="kbd">Del</span> sell</span>
              <span className="flex items-center gap-1"><span className="kbd">Esc</span> cancel</span>
            </div>
          </div>

          <TopBar sim={sim} speed={speed} goHint={!!showTarget?.go} onSpeed={setSpeed} onGo={toggleGo} />

          <Board
            sim={sim} tick={tick} boardRef={boardRef} canvasRef={canvasRef}
            selected={selected} hand={hand} wiring={wiring} target={showTarget} quake={quake}
            onBoardDown={onBoardDown} onBoardMove={onBoardMove}
            onNodeDown={onNodeDown} onPortDown={onPortDown} onCut={onCut} onSell={onSell} onUpgrade={onUpgrade} comboPulse={comboPulse}
          />

          <BottomPanel
            sim={sim} coach={msg} tab={panelTab} open={panelOpen}
            onTab={setPanelTab} onToggle={() => setPanelOpen((o) => !o)}
          />
        </main>
      </div>

      {/* status bar */}
      <div className="flex h-6 shrink-0 items-center gap-4 px-3 text-[11px] text-white/90 transition-colors duration-500 [@media(max-height:520px)]:hidden" style={{ background: barColor }}>
        <span className="flex items-center gap-1.5"><Icon name="branch" size={12} /> main</span>
        <span className="flex items-center gap-1.5 font-bold uppercase"><span className={cn('h-1.5 w-1.5 rounded-full bg-white', sim.status === 'running' && 'animate-pulse')} />{state}</span>
        <span className="hidden sm:inline">traffic {sim.traffic.toFixed(1)}/s</span>
        <span className="hidden sm:inline">uptime {(sim.uptime * 100).toFixed(1)}%</span>
        <span className="hidden md:inline">p95 {Math.round(sim.p95)}ms</span>
        <span className="hidden md:inline">{sim.rps.toFixed(1)} served/s</span>
        <span className="ml-auto hidden sm:inline">{sim.nodes.length - 1} {sim.nodes.length === 2 ? 'box' : 'boxes'}, {sim.wires.length} {sim.wires.length === 1 ? 'wire' : 'wires'}</span>
      </div>

      {toast && (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-none absolute bottom-32 left-1/2 z-30 flex -translate-x-1/2 animate-pop items-center gap-2 rounded-xl border bg-panel px-4 py-2 text-sm font-bold shadow-xl',
            toast.tone === 'bad' ? 'border-bad/60 text-bad' : 'border-ok/60 text-ok',
          )}
        >
          <Icon name={toast.tone === 'bad' ? 'warn' : 'sparkle'} size={16} />
          {toast.text}
        </div>
      )}

      <div className="absolute inset-0 z-50 hidden flex-col items-center justify-center gap-3 bg-ink text-center portrait:max-md:flex">
        <Icon name="rotate" size={56} className="text-gold" />
        <div className="text-lg font-bold">Rotate your phone</div>
        <div className="text-xs text-dim">The board needs a wide screen.</div>
      </div>

      {phase === 'intro' && <Intro level={level} onStart={() => { sfx.click(); setPhase('play'); }} onBack={onMenu} />}
      {tutOn && steps && phase === 'play' && (
        <TutorialLayer key={tutRun} steps={steps} sim={sim} tick={tick} stepRef={tutRef} onDone={endTutorial} />
      )}
      {phase === 'result' && (
        <Result
          sim={sim} prevBest={startBest.current} prevBank={startBank.current} hasNext={hasNext}
          onNext={onNext} onRetry={onRetry} onMenu={onMenu}
        />
      )}
    </div>
  );
}
