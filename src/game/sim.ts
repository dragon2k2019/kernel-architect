import { mulberry32 } from './rng';
import {
  NODE_DEFS, REQ, TUNING, rateAt,
  type GameEvent, type Kind, type Level, type ReqType,
} from './content';

export const BOARD_W = 960;
export const BOARD_H = 560;
export const NODE_W = 104;
export const NODE_H = 88;
export const SNAP = 8;

export type Status = 'planning' | 'running' | 'paused' | 'won' | 'lost';

export interface Req {
  id: number;
  type: ReqType;
  born: number;
  wire: number;
  p: number;
  viaServer: boolean;
  path: string;
  method: string;
}
export interface SNode {
  id: number;
  kind: Kind;
  name: string;
  x: number;
  y: number;
  queue: Req[];
  cur: Req | null;
  busy: number;
  busyTotal: number;
  down: number;
  rr: number;
  handled: number;
  load: number;
  paid: number;
  heat: number; // 0..1, servers and databases overheat when worked hard for too long
  hot: boolean; // throttled until it cools down
  lvl: number; // 1..3 upgrade level
}
export interface SWire { id: number; from: number; to: number }
export interface LogLine {
  id: number; t: number; code: number; method: string; path: string; node: string; ms: number; note: string;
}
export interface Fx { id: number; x: number; y: number; text: string; color: string; age: number }
export type SimEvent =
  | { type: 'ok'; x: number; y: number; revenue: number; data: boolean; mult: number }
  | { type: 'vip'; x: number; y: number; revenue: number }
  | { type: 'tier'; tier: number; combo: number }
  | { type: 'comboBreak'; combo: number }
  | { type: 'block'; x: number; y: number }
  | { type: 'leak'; x: number; y: number }
  | { type: 'overheat'; x: number; y: number }
  | { type: 'cooled'; x: number; y: number }
  | { type: 'poke'; x: number; y: number; left: number; kind: 'reboot' | 'cool' }
  | { type: 'upgrade'; x: number; y: number; lvl: number }
  | { type: 'ddos' }
  | { type: 'fail'; x: number; y: number; code: number }
  | { type: 'crash'; x: number; y: number }
  | { type: 'spike' }
  | { type: 'warn' }
  | { type: 'back'; x: number; y: number };
export interface Banner { text: string; kind: 'warn' | 'bad' | 'info'; until: number }

export const FAIL_HELP: Record<number, string> = {
  503: '503 = line is full. Add servers, or put a Cache in front. Bots? Use a Firewall.',
  504: '504 = too slow. Visitors waited too long. Add capacity.',
  502: '502 = dead end. A wire leads nowhere, or a box is down.',
  500: '500 = a server needs a Database wired after it.',
  403: '403 = databases only accept traffic from servers.',
  404: '404 = wrong box. Visitors need a path to a server.',
};

const PAGE_PATHS = ['/', '/pricing', '/blog/why-rust', '/docs', '/about', '/changelog', '/login'];
const BOT_PATHS = ['/wp-login.php', '/.env', '/admin', '/phpmyadmin', '/xmlrpc.php', '/.git/config', '/scrape?page=9'];
const VIP_PATHS = ['/checkout', '/enterprise/contact', '/api/billing', '/upgrade?plan=max'];
const DATA_PATHS = ['/api/users', '/api/orders', '/api/search?q=k8s', '/api/cart', '/api/feed', '/api/me'];

export interface Result { ok: boolean; reason?: string; replaced?: number }

export class Sim {
  level: Level;
  rng: () => number;
  t = 0;
  status: Status = 'planning';
  nodes: SNode[] = [];
  wires: SWire[] = [];
  reqs: Req[] = [];
  cash: number;
  happy = 100;
  ok = 0;
  fail = 0;
  byCode: Record<number, number> = {};
  lat: number[] = [];
  logs: LogLine[] = [];
  fx: Fx[] = [];
  banner: Banner | null = null;
  stars = 0;
  earned = 0;
  combo = 0;
  bestCombo = 0;
  blocked = 0;
  leaked = 0;
  vipOk = 0;
  vipLost = 0;
  evq: SimEvent[] = [];
  failTimes: { t: number; code: number }[] = [];
  doneTimes: number[] = [];
  private nextId = 1;
  private acc = 0;
  private spikeUntil = 0;
  private spikeMult = 1;
  private ddosUntil = 0;
  private evIdx = 0;
  private warned = new Set<number>();
  private counters: Record<string, number> = {};
  internetId: number;

  constructor(level: Level, seed = 1337) {
    this.level = level;
    this.rng = mulberry32(seed + level.n * 101);
    this.cash = level.cash;
    this.internetId = this.spawnNode('internet', 24, Math.round((BOARD_H - NODE_H) / 2 / SNAP) * SNAP).id;
  }

  // ---------- helpers ----------
  node(id: number): SNode | undefined { return this.nodes.find((n) => n.id === id); }
  outs(id: number): SWire[] { return this.wires.filter((w) => w.from === id); }
  ins(id: number): SWire[] { return this.wires.filter((w) => w.to === id); }
  count(kind: Kind): number { return this.nodes.filter((n) => n.kind === kind).length; }
  get uptime(): number { const d = this.ok + this.fail; return d === 0 ? 1 : this.ok / d; }
  get p95(): number {
    if (!this.lat.length) return 0;
    const a = [...this.lat].sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] * TUNING.latencyScale;
  }
  get traffic(): number {
    return rateAt(this.level, this.t) * (this.t < this.spikeUntil ? this.spikeMult : 1);
  }
  get rps(): number {
    const cut = this.t - 3;
    return this.doneTimes.filter((x) => x > cut).length / 3;
  }
  get spiking(): boolean { return this.t < this.spikeUntil; }
  get ddos(): boolean { return this.t < this.ddosUntil; }
  get comboTier(): number { return Math.min(TUNING.comboMaxTier, Math.floor(this.combo / TUNING.comboStep)); }
  get comboMult(): number { return 1 + TUNING.comboBonus * this.comboTier; }
  get botShare(): number {
    let s = this.level.botShare ?? 0;
    if (this.level.endless) s = 0.1 + Math.min(0.25, this.t * 0.0012);
    if (this.t < this.ddosUntil) s = Math.max(s, 0.65);
    return s;
  }
  wireLen(w: SWire): number {
    const a = this.node(w.from); const b = this.node(w.to);
    if (!a || !b) return 100;
    const dx = b.x - (a.x + NODE_W); const dy = b.y - a.y;
    return Math.max(60, Math.hypot(dx, dy) * 1.12);
  }

  private spawnNode(kind: Kind, x: number, y: number): SNode {
    const def = NODE_DEFS[kind];
    const c = (this.counters[def.short] = (this.counters[def.short] ?? 0) + 1);
    const n: SNode = {
      id: this.nextId++, kind, name: kind === 'internet' ? 'internet' : `${def.short}-${c}`,
      x, y, queue: [], cur: null, busy: 0, busyTotal: 1, down: 0, rr: 0, handled: 0, load: 0, paid: def.cost,
      heat: 0, hot: false, lvl: 1,
    };
    this.nodes.push(n);
    return n;
  }

  // ---------- building ----------
  static snap(v: number): number { return Math.round(v / SNAP) * SNAP; }
  clampPos(x: number, y: number): { x: number; y: number } {
    return {
      x: Math.max(0, Math.min(BOARD_W - NODE_W, Sim.snap(x))),
      y: Math.max(0, Math.min(BOARD_H - NODE_H, Sim.snap(y))),
    };
  }
  fits(x: number, y: number, ignore?: number): boolean {
    const m = 10;
    return !this.nodes.some((n) =>
      n.id !== ignore && x < n.x + NODE_W + m && x + NODE_W + m > n.x && y < n.y + NODE_H + m && y + NODE_H + m > n.y);
  }
  canPlace(kind: Kind, x: number, y: number): Result {
    if (this.status === 'won' || this.status === 'lost') return { ok: false, reason: 'Game over' };
    if (this.cash < NODE_DEFS[kind].cost) return { ok: false, reason: `Not enough $ for a ${NODE_DEFS[kind].label}` };
    const p = this.clampPos(x, y);
    if (!this.fits(p.x, p.y)) return { ok: false, reason: 'Too close to another box' };
    return { ok: true };
  }
  place(kind: Kind, x: number, y: number): Result & { node?: SNode } {
    const r = this.canPlace(kind, x, y);
    if (!r.ok) return r;
    const p = this.clampPos(x, y);
    this.cash -= NODE_DEFS[kind].cost;
    return { ok: true, node: this.spawnNode(kind, p.x, p.y) };
  }
  move(id: number, x: number, y: number): boolean {
    const n = this.node(id);
    if (!n || n.kind === 'internet') return false;
    const p = this.clampPos(x, y);
    if (!this.fits(p.x, p.y, id)) return false;
    n.x = p.x; n.y = p.y;
    return true;
  }
  sellValue(id: number): number {
    const n = this.node(id);
    if (!n) return 0;
    return Math.round(n.paid * (this.status === 'planning' ? 1 : TUNING.sellRefund));
  }
  remove(id: number): boolean {
    const n = this.node(id);
    if (!n || n.kind === 'internet') return false;
    this.cash += this.sellValue(id);
    this.wires = this.wires.filter((w) => w.from !== id && w.to !== id);
    this.nodes = this.nodes.filter((x) => x.id !== id);
    for (const r of [...n.queue, ...(n.cur ? [n.cur] : [])]) this.failReq(r, 502, n, 'host removed');
    return true;
  }
  upgradeCost(id: number): number | null {
    const n = this.node(id);
    if (!n || (n.kind !== 'server' && n.kind !== 'db') || n.lvl >= TUNING.maxLevel) return null;
    return Math.round(NODE_DEFS[n.kind].cost * (n.lvl === 1 ? 0.75 : 1.1));
  }
  upgrade(id: number): Result {
    const n = this.node(id);
    const c = this.upgradeCost(id);
    if (!n) return { ok: false, reason: 'Missing box' };
    if (c === null) return { ok: false, reason: 'Already maxed out' };
    if (this.status === 'won' || this.status === 'lost') return { ok: false, reason: 'Game over' };
    if (this.cash < c) return { ok: false, reason: `Need $${c} to overclock` };
    this.cash -= c; n.paid += c; n.lvl++;
    this.emit({ type: 'upgrade', x: n.x + NODE_W / 2, y: n.y + NODE_H / 2, lvl: n.lvl });
    return { ok: true };
  }
  /** Rate multiplier from upgrades and throttling. */
  speedOf(n: SNode): number {
    return (1 + TUNING.upgradeRate * (n.lvl - 1)) * (n.hot ? TUNING.throttle : 1);
  }
  /** Click a crashed box to reboot it faster, or an overheating box to cool it down. */
  poke(id: number): boolean {
    const n = this.node(id);
    if (!n || this.status !== 'running') return false;
    const x = n.x + NODE_W / 2; const y = n.y + NODE_H / 2;
    if (n.down > 0) {
      n.down = Math.max(0, n.down - TUNING.pokeSeconds);
      this.emit({ type: 'poke', x, y, left: n.down, kind: 'reboot' });
      if (n.down <= 0) this.revive(n);
      return true;
    }
    if (n.heat > 0.5 && NODE_DEFS[n.kind].rate > 0) {
      n.heat = Math.max(0, n.heat - TUNING.pokeCool);
      this.emit({ type: 'poke', x, y, left: n.heat, kind: 'cool' });
      if (n.hot && n.heat <= TUNING.heatResume) { n.hot = false; this.emit({ type: 'cooled', x, y }); }
      return true;
    }
    return false;
  }
  private revive(n: SNode) {
    n.down = 0; n.heat = 0; n.hot = false;
    this.emit({ type: 'back', x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 });
    this.log(0, 'SYS', '', n.name, `${n.name} is back online`);
  }

  private reaches(from: number, target: number, seen = new Set<number>()): boolean {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return this.outs(from).some((w) => this.reaches(w.to, target, seen));
  }
  canWire(from: number, to: number): Result {
    const a = this.node(from); const b = this.node(to);
    if (!a || !b) return { ok: false, reason: 'Missing box' };
    if (a.id === b.id) return { ok: false, reason: "Can't connect a box to itself" };
    if (a.kind === 'db') return { ok: false, reason: 'Databases are the end of the line' };
    if (b.kind === 'internet') return { ok: false, reason: 'Nothing flows back into the internet' };
    if (this.wires.some((w) => w.from === from && w.to === to)) return { ok: false, reason: 'Already connected' };
    if (this.reaches(to, from)) return { ok: false, reason: 'That would make an infinite loop' };
    const replaced = a.kind === 'internet' ? this.outs(from)[0]?.id : undefined;
    return { ok: true, replaced };
  }
  wire(from: number, to: number): Result {
    const r = this.canWire(from, to);
    if (!r.ok) return r;
    if (r.replaced) this.cut(r.replaced);
    this.wires.push({ id: this.nextId++, from, to });
    return r;
  }
  cut(id: number) {
    this.wires = this.wires.filter((w) => w.id !== id);
  }

  // ---------- control ----------
  go() { if (this.status === 'planning' || this.status === 'paused') this.status = 'running'; }
  pause() { if (this.status === 'running') this.status = 'paused'; }

  // ---------- simulation ----------
  step(dt: number) {
    if (this.status !== 'running') return;
    this.t += dt;
    this.runEvents();
    this.spawn(dt);
    this.moveReqs(dt);
    for (const n of this.nodes) this.work(n, dt);
    for (const f of this.fx) f.age += dt;
    this.fx = this.fx.filter((f) => f.age < 1.2);
    if (this.banner && this.t > this.banner.until) this.banner = null;
    this.failTimes = this.failTimes.filter((f) => this.t - f.t < 4);
    if (this.doneTimes.length > 400) this.doneTimes = this.doneTimes.slice(-200);
    this.checkEnd();
  }

  private runEvents() {
    const evs = this.level.events;
    // heads-up a few seconds before things go wrong
    evs.forEach((e, i) => {
      if (!this.warned.has(i) && this.t >= e.at - 4 && this.t < e.at) {
        this.warned.add(i);
        this.emit({ type: 'warn' });
        this.banner = {
          text: e.kind === 'spike' ? 'Traffic spike incoming...' : e.kind === 'ddos' ? 'Bot swarm incoming...' : 'Something is about to break...',
          kind: 'warn', until: e.at,
        };
      }
    });
    while (this.evIdx < evs.length && evs[this.evIdx].at <= this.t) this.fire(evs[this.evIdx++]);
  }

  private fire(e: GameEvent) {
    if (e.kind === 'spike') {
      this.spikeUntil = this.t + (e.dur ?? 12);
      this.spikeMult = e.mult ?? 2;
      this.emit({ type: 'spike' });
      this.banner = { text: `You're #1 on Hacker News!  traffic x${this.spikeMult}`, kind: 'bad', until: this.spikeUntil };
      this.log(0, 'SYS', '', 'hn', `front page hit - traffic x${this.spikeMult}`);
    } else if (e.kind === 'ddos') {
      this.ddosUntil = this.t + (e.dur ?? 12);
      this.spikeUntil = Math.max(this.spikeUntil, this.ddosUntil);
      this.spikeMult = e.mult ?? 2;
      this.emit({ type: 'ddos' });
      this.banner = { text: `DDoS! Bots are flooding in  traffic x${this.spikeMult}`, kind: 'bad', until: this.ddosUntil };
      this.log(0, 'SYS', '', 'waf', `bot swarm detected - traffic x${this.spikeMult}`);
    } else {
      const pool = this.nodes.filter((n) => n.down <= 0 && (e.target === 'any' || !e.target
        ? n.kind === 'server' || n.kind === 'db' : n.kind === e.target));
      if (!pool.length) return;
      const v = pool[Math.floor(this.rng() * pool.length)];
      v.down = TUNING.crashSeconds; v.heat = 0; v.hot = false;
      this.emit({ type: 'crash', x: v.x + NODE_W / 2, y: v.y + NODE_H / 2 });
      const msg = v.kind === 'db' ? `${v.name} ran out of disk` : `${v.name} was OOM-killed`;
      this.banner = { text: `${msg}. Click it to reboot faster!`, kind: 'bad', until: this.t + 5 };
      this.log(0, 'SYS', '', v.name, msg);
      for (const r of [...v.queue, ...(v.cur ? [v.cur] : [])]) this.failReq(r, 502, v, 'host crashed');
      v.queue = []; v.cur = null;
    }
  }

  private spawn(dt: number) {
    this.acc += this.traffic * dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      const id = this.nextId++;
      const roll = this.rng();
      const bs = this.botShare;
      const vs = this.level.vipShare ?? 0;
      const type: ReqType = roll < bs ? 'bot'
        : roll < bs + vs ? 'vip'
          : this.rng() < this.level.dataShare ? 'data' : 'page';
      const inet = this.node(this.internetId)!;
      const req: Req = {
        id, type, born: this.t, wire: 0, p: 0, viaServer: false,
        method: type === 'page' || type === 'bot' ? 'GET' : id % 2 ? 'POST' : 'GET',
        path: (type === 'page' ? PAGE_PATHS : type === 'data' ? DATA_PATHS : type === 'bot' ? BOT_PATHS : VIP_PATHS)[
          id % (type === 'page' ? PAGE_PATHS.length : type === 'data' ? DATA_PATHS.length : type === 'bot' ? BOT_PATHS.length : VIP_PATHS.length)
        ],
      };
      const w = this.pick(inet);
      if (!w) this.failReq(req, 404, inet, 'no route');
      else this.send(w, req);
    }
  }

  private send(w: SWire, r: Req) { r.wire = w.id; r.p = 0; this.reqs.push(r); }

  /** Round-robin over outgoing wires, skipping crashed boxes when someone is alive (a health check). */
  private pick(n: SNode, preferKind?: Kind): SWire | null {
    let outs = this.outs(n.id);
    if (preferKind) {
      const pref = outs.filter((w) => this.node(w.to)?.kind === preferKind);
      if (pref.length) outs = pref;
    }
    const alive = outs.filter((w) => (this.node(w.to)?.down ?? 1) <= 0);
    const pool = alive.length ? alive : outs;
    if (!pool.length) return null;
    return pool[n.rr++ % pool.length];
  }

  private moveReqs(dt: number) {
    // Work on a snapshot: arrive() may forward a request onto another wire (pushing to this.reqs).
    const flying = this.reqs;
    this.reqs = [];
    for (const r of flying) {
      const w = this.wires.find((x) => x.id === r.wire);
      if (!w) { this.failReq(r, 502, this.node(this.internetId)!, 'wire cut'); continue; }
      r.p += (TUNING.wireSpeed * dt) / this.wireLen(w);
      if (r.p >= 1) {
        const to = this.node(w.to);
        if (to) this.arrive(to, r);
      } else this.reqs.push(r);
    }
  }

  private arrive(n: SNode, r: Req) {
    if (n.down > 0) return this.failReq(r, 502, n, 'host down');
    const def = NODE_DEFS[n.kind];
    n.handled++;
    switch (n.kind) {
      case 'lb': {
        const w = this.pick(n);
        return w ? this.send(w, r) : this.failReq(r, 502, n, 'no upstream');
      }
      case 'fw': {
        if (r.type === 'bot' && this.rng() < TUNING.botBlock) return this.block(r, n, true);
        const w = this.pick(n);
        return w ? this.send(w, r) : this.failReq(r, 502, n, 'no upstream');
      }
      case 'cache': {
        if (r.type === 'bot' && this.rng() < TUNING.cacheHit) return this.block(r, n, false);
        if (this.rng() < TUNING.cacheHit) return this.succeed(r, n, 'cache hit');
        const w = this.pick(n);
        return w ? this.send(w, r) : this.failReq(r, 502, n, 'no upstream');
      }
      case 'server':
        if (n.queue.length >= def.queue) return this.failReq(r, 503, n, 'queue full');
        n.queue.push(r);
        return;
      case 'db':
        if (!r.viaServer) return this.failReq(r, 403, n, 'forbidden');
        if (r.type !== 'data') return this.failReq(r, 404, n, 'not found');
        if (n.queue.length >= def.queue) return this.failReq(r, 503, n, 'queue full');
        n.queue.push(r);
        return;
      default:
        return this.failReq(r, 404, n, 'not found');
    }
  }

  private work(n: SNode, dt: number) {
    const def = NODE_DEFS[n.kind];
    if (n.down > 0) {
      n.down -= dt;
      if (n.down <= 0) this.revive(n);
      n.load += (0 - n.load) * Math.min(1, dt * 4);
      return;
    }
    if (def.rate > 0) {
      // time out anything that has been waiting too long
      if (n.queue.length) {
        const live: Req[] = [];
        for (const r of n.queue) (this.t - r.born > (r.type === 'vip' ? TUNING.vipTimeout : TUNING.timeout) ? this.failReq(r, 504, n, 'timeout') : live.push(r));
        n.queue = live;
      }
      let left = dt;
      let guard = 0;
      while (left > 1e-9 && guard++ < 8) {
        if (!n.cur) {
          if (!n.queue.length) break;
          n.cur = n.queue.shift()!;
          n.busyTotal = (1 / (def.rate * this.speedOf(n))) * (0.85 + 0.3 * this.rng());
          n.busy = n.busyTotal;
        }
        const use = Math.min(left, n.busy);
        n.busy -= use; left -= use;
        if (n.busy <= 1e-9) { const r = n.cur; n.cur = null; this.finish(n, r); }
      }
      n.load += ((n.cur ? 1 : 0) - n.load) * Math.min(1, dt * 4);
      this.heatStep(n, def.queue, dt);
    } else {
      n.load += (0 - n.load) * Math.min(1, dt * 4);
    }
  }

  private heatStep(n: SNode, queueMax: number, dt: number) {
    const x = n.x + NODE_W / 2; const y = n.y + NODE_H / 2;
    const fill = queueMax ? n.queue.length / queueMax : 0;
    if (n.hot) {
      n.heat = Math.max(0, n.heat - TUNING.heatVentHot * dt);
      if (n.heat <= TUNING.heatResume) { n.hot = false; this.emit({ type: 'cooled', x, y }); }
    } else if (n.cur) {
      n.heat = Math.min(1, n.heat + (dt * TUNING.heatRate * (0.55 + fill)) / (1 + 0.55 * (n.lvl - 1)));
      if (n.heat >= 1) { n.hot = true; this.emit({ type: 'overheat', x, y }); this.addFx(n, 'OVERHEAT', '#ff9e64'); }
    } else n.heat = Math.max(0, n.heat - TUNING.heatVent * dt);
  }

  private block(r: Req, n: SNode, pay: boolean) {
    this.blocked++;
    if (pay) { this.cash += 1; this.earned += 1; this.addFx(n, 'BLOCKED +$1', '#2ac3de'); }
    this.log(403, r.method, r.path, n.name, pay ? 'bot blocked' : 'bot absorbed', this.t - r.born, r.id);
    this.emit({ type: 'block', x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 });
  }

  private finish(n: SNode, r: Req) {
    if (n.kind === 'db') return this.succeed(r, n, 'ok');
    // server
    if (r.type !== 'data') return this.succeed(r, n, 'ok');
    r.viaServer = true;
    const w = this.pick(n, 'db');
    if (!w) return this.failReq(r, 500, n, 'no database');
    this.send(w, r);
  }

  private breakCombo() {
    if (this.combo >= TUNING.comboStep) this.emit({ type: 'comboBreak', combo: this.combo });
    this.combo = 0;
  }

  private succeed(r: Req, n: SNode, note: string) {
    const x = n.x + NODE_W / 2; const y = n.y + NODE_H / 2;
    if (r.type === 'bot') {
      // a bot got all the way to a real server: wasted capacity and a broken streak
      this.leaked++;
      this.happy = Math.max(0, this.happy - TUNING.botLeak);
      this.breakCombo();
      this.log(200, r.method, r.path, n.name, 'bot served (wasted)', this.t - r.born, r.id);
      this.addFx(n, 'BOT', '#ff4d6d');
      this.emit({ type: 'leak', x, y });
      return;
    }
    this.ok++;
    const before = this.comboTier;
    this.combo += r.type === 'vip' ? TUNING.vipComboBoost : 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const mult = this.comboMult;
    const base = REQ[r.type].revenue;
    const rev = Math.max(1, Math.round(base * mult));
    this.cash += rev;
    this.earned += rev;
    if (this.comboTier > before) this.emit({ type: 'tier', tier: this.comboTier, combo: this.combo });
    if (r.type === 'vip') {
      this.vipOk++;
      this.emit({ type: 'vip', x, y, revenue: rev });
      this.addFx(n, `VIP +$${rev}`, '#fff27a');
    }
    this.emit({ type: 'ok', x, y, revenue: rev, data: r.type === 'data', mult });
    this.happy = Math.min(100, this.happy + TUNING.okGain);
    const dur = this.t - r.born;
    this.lat.push(dur); if (this.lat.length > 120) this.lat.shift();
    this.doneTimes.push(this.t);
    this.byCode[200] = (this.byCode[200] ?? 0) + 1;
    this.log(200, r.method, r.path, n.name, note, dur, r.id);
    if (r.type !== 'vip' && this.ok % 4 === 0) this.addFx(n, `+$${rev * 4}`, mult > 1 ? '#ffd34d' : '#9ece6a');
  }

  private failReq(r: Req, code: number, n: SNode, note: string) {
    this.byCode[code] = (this.byCode[code] ?? 0) + 1;
    this.log(code, r.method, r.path, n.name, note, this.t - r.born, r.id);
    if (r.type === 'bot') return; // bots that bounce off a full queue are not your problem
    this.fail++;
    if (r.type === 'vip') { this.vipLost++; this.addFx(n, 'VIP LOST', '#ff6b8b'); }
    this.happy = Math.max(0, this.happy - TUNING.failCost * (r.type === 'vip' ? TUNING.vipFailMult : 1));
    this.failTimes.push({ t: this.t, code });
    this.breakCombo();
    this.addFx(n, String(code), '#f7768e');
    this.emit({ type: 'fail', x: n.x + NODE_W / 2, y: n.y + NODE_H / 2, code });
  }

  private addFx(n: SNode, text: string, color: string) {
    if (this.fx.length > 40) this.fx.shift();
    this.fx.push({ id: this.nextId++, x: n.x + NODE_W / 2 + (this.rng() - 0.5) * 30, y: n.y, text, color, age: 0 });
  }

  private emit(e: SimEvent) {
    if (this.evq.length < 200) this.evq.push(e);
  }

  private log(code: number, method: string, path: string, node: string, note: string, dur = 0, id?: number) {
    this.logs.push({ id: id ?? this.nextId++, t: this.t, code, method, path, node, ms: Math.round(dur * TUNING.latencyScale), note });
    if (this.logs.length > 60) this.logs.shift();
  }

  /** The most common recent failure code, for the coach. */
  get recentFailCode(): number | null {
    if (this.failTimes.length < 2) return null;
    const c: Record<number, number> = {};
    for (const f of this.failTimes) c[f.code] = (c[f.code] ?? 0) + 1;
    return Number(Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]);
  }

  private checkEnd() {
    if (this.happy <= 0) { this.status = 'lost'; this.stars = 0; return; }
    const goal = this.level.goal;
    if (goal !== null && this.ok >= goal) {
      this.status = 'won';
      this.stars = this.uptime >= 0.99 ? 3 : this.uptime >= 0.95 ? 2 : 1;
    }
  }

  /** Worst failure code across the run, for the post-mortem. */
  get topFailCode(): number | null {
    const e = Object.entries(this.byCode).filter(([c]) => c !== '200').sort((a, b) => b[1] - a[1]);
    return e.length ? Number(e[0][0]) : null;
  }
}
