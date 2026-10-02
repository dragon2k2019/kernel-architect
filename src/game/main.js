// src/game/main.js — the application: screens, input, the fixed-step loop, progress.
//
// Boot: check WebGL2 (the canvas is the whole UI), build the renderer, then run the title screen.
// The simulation only ever advances through Sim.step(), so pausing and fast-forwarding are exact:
// nothing here touches the sim's timing, and the seed + the action log fully describe a run.

import { Renderer } from '../render/renderer.js';
import { Term, PAL } from '../render/term.js';
import * as HUD from '../render/hud.js';
import { Sim, NODE_W, NODE_H, WORLD_W, WORLD_H } from '../sim/sim.js';
import {
  LEVELS, ENDLESS, NODES, NODE, TRAFFIC, SIM, PALETTE,
  dailyLevel, generateIncidents,
} from '../sim/content.js';
import { Rng, streamSeed, toHex8 } from '../core/rng.js';
import { Input } from './input.js';
import { Audio } from './audio.js';

const SAVE_KEY = 'kernelarchitect.save.v1';
const SPEEDS = [1, 2, 4, 8];
const clampI = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.term = new Term(HUD.COLS, HUD.ROWS);
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.glInfo = glRendererName(this.renderer.gl);

    const saved = loadSave();
    this.progress = saved.progress || {};
    this.practice = !!saved.practice;
    this.crt = saved.crt !== false;
    this.audio.muted = !!saved.muted;
    this.seedPref = saved.seedPref || null;

    this.screen = 'title';
    this.screenBack = 'title';
    this.ui = freshUi();
    this.sim = null;
    this.level = null;
    this.time = 0; this.acc = 0; this.perfMs = 0; this.perfAcc = 0; this.perfN = 0;
    this.hashHex = '--------'; this.seedHex = '--------';
    this.speed = 1; this.paused = false;
    this.toast = null; this.lastLogSeq = 0; this.lastDropped = 0; this.lastTick = 0;
    this.items = [];

    window.addEventListener('resize', () => this.renderer.fit());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.screen === 'play') this.paused = true; });
    this.renderer.fit();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------------ progress
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        progress: this.progress, practice: this.practice, crt: this.crt,
        muted: this.audio.muted, seedPref: this.seedPref,
      }));
    } catch (e) { /* private mode: the run still works, it just will not be remembered */ }
  }
  wonCount() { return LEVELS.filter((l) => (this.progress[l.id] || 0) > 0).length; }
  unlocked(i) { return i === 0 || this.practice || (this.progress[LEVELS[i - 1].id] || 0) > 0; }
  nextLevel() {
    for (let i = 0; i < LEVELS.length; i++) if (!(this.progress[LEVELS[i].id] > 0)) return i;
    return LEVELS.length - 1;
  }
  levelSeed(level) {
    if (this.seedPref) return this.seedPref >>> 0;
    const i = LEVELS.indexOf(level);
    if (i >= 0) return streamSeed(0x9e3779b9, i + 1);
    if (level.id === 'ENDLESS') return streamSeed(0x9e3779b9, 101);
    return level.seed || streamSeed(0x9e3779b9, 202);
  }

  // ------------------------------------------------------------------ screens
  menuItems() {
    if (this.screen === 'title') {
      const nxt = this.nextLevel();
      const items = [];
      items.push({ label: 'CONTINUE  ' + LEVELS[nxt].id + ' ' + LEVELS[nxt].name, note: 'pick up where you left off', action: () => this.startLevel(LEVELS[nxt]) });
      items.push({ label: 'CAMPAIGN', note: `${this.wonCount()}/${LEVELS.length} shifts cleared`, action: () => this.goto('levels') });
      items.push({ label: 'DAILY SHIFT', note: this.dailyLabel(), action: () => this.startDaily() });
      items.push({ label: 'ENDLESS SHIFT', note: 'ramps forever, score = requests served', action: () => this.startEndless() });
      items.push({
        label: 'SHIFT SEED', note: this.seedPref ? 'CUSTOM 0x' + toHex8(this.seedPref) : 'fixed per shift (comparable runs)',
        action: () => { this.seedPref = this.seedPref ? null : (Math.random() * 0xffffffff) >>> 0; this.save(); },
      });
      items.push({
        label: 'PRACTICE MODE', note: this.practice ? 'ON — every shift unlocked' : 'OFF — shifts unlock in order',
        action: () => { this.practice = !this.practice; this.save(); },
      });
      items.push({ label: 'HELP', note: 'controls • node table • traffic table', action: () => this.gotoHelp('title') });
      items.push({
        label: 'RESET PROGRESS', note: 'forget every star',
        action: () => this.confirm('Erase all stars and unlocks?', () => { this.progress = {}; this.save(); }),
      });
      return items;
    }
    if (this.screen === 'levels') {
      const items = LEVELS.map((l, i) => {
        const st = this.progress[l.id] || 0;
        return {
          label: `${l.id} ${l.name}`, note: st ? `cleared ★${st}   ${l.brief.slice(0, 46)}…` : l.brief.slice(0, 52),
          brief: l.brief, teaches: l.teaches, locked: !this.unlocked(i), stars: st, action: () => this.startLevel(l),
        };
      });
      items.push({ label: 'DAILY SHIFT', note: this.dailyLabel() + ' — same run for everyone', brief: 'One seed, one shift, one shot everyone plays the same traffic and the same incidents.', teaches: 'Nothing new: read the flow overlay before you commit money.', locked: false, action: () => this.startDaily() });
      items.push({ label: 'ENDLESS SHIFT', note: 'ramps forever, score = requests served', brief: ENDLESS.brief, teaches: ENDLESS.teaches, locked: false, action: () => this.startEndless() });
      items.push({ label: '← BACK TO TITLE', note: '', locked: false, action: () => this.goto('title') });
      return items;
    }
    return [];
  }
  dailyLabel() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }
  goto(screen) {
    if (screen === 'help') return this.gotoHelp(this.screen);
    this.screen = screen;
    this.ui.menu = 0;
    if (screen !== 'play' && screen !== 'post') { this.sim = null; this.level = null; }
    this.audio.play('click');
  }
  gotoHelp(back) { this.screenBack = back === 'help' ? this.screenBack : back; this.screen = 'help'; this.ui.helpPage = 0; }
  backFromHelp() { this.screen = this.screenBack; this.ui.menu = 0; }

  startLevel(level, seedOverride) {
    if (!level.unlock) level.unlock = PALETTE.slice();      // DAILY builds with the full palette
    this.level = level;
    this.sim = new Sim(level, { seed: seedOverride || this.levelSeed(level) });
    if (level.id === 'ENDLESS' || level.id === 'DAILY') {
      if (!this.sim.incidents.length || level.id === 'ENDLESS') {
        this.sim.incidents = generateIncidents(level.id, this.sim.seed, new Rng(streamSeed(this.sim.seed, 77)));
        this.sim.incidentI = 0;
      }
    }
    this.afterStart();
  }
  startDaily() {
    const d = new Date();
    const seed = this.seedPref || hashDate(d);
    const lv = dailyLevel(d.toISOString().slice(0, 10), seed);
    this.startLevel(lv, seed);
  }
  startEndless() {
    const seed = this.seedPref || ((Math.random() * 0xffffffff) >>> 0);
    this.startLevel(ENDLESS, seed);
  }
  afterStart() {
    this.seedHex = toHex8(this.sim.seed);
    this.speed = 1; this.paused = false; this.acc = 0;
    this.toast = { msg: `SHIFT ${this.level.id} DEPLOYED — seed ${this.seedHex}. Traffic arrives when the path is ready.`, until: 240 };
    this.lastLogSeq = this.sim.logSeq; this.lastDropped = 0;
    this.ui = freshUi();
    this.screen = 'play';
    this.audio.play('place');
  }
  confirm(text, action) { this.ui.confirm = { text, action }; }
  note(msg) { this.ui.note = msg; this.ui.noteUntil = this.time + 4; }

  // ------------------------------------------------------------------ input
  handleInput(presses, clicks) {
    const ui = this.ui;
    if (ui.confirm) {
      for (const k of presses) {
        if (k === 'enter' || k === 'y') { const a = ui.confirm.action; ui.confirm = null; if (a) a(); }
        else if (k === 'escape' || k === 'n') ui.confirm = null;
      }
      return;
    }
    switch (this.screen) {
      case 'title': this.titleInput(presses, clicks); break;
      case 'levels': this.levelInput(presses, clicks); break;
      case 'help': this.helpInput(presses); break;
      case 'play': this.playInput(presses, clicks); break;
      case 'post': this.postInput(presses, clicks); break;
    }
  }

  titleInput(presses, clicks) {
    const items = this.items = this.menuItems();
    for (const k of presses) {
      if (k === 'ArrowUp') ui_(this, -1);
      else if (k === 'ArrowDown') ui_(this, 1);
      else if (k === 'enter' || k === 'space') { const it = items[this.ui.menu]; if (it) { this.audio.play('click'); it.action(); } }
      else if (k === 'h' || k === 'F1' || k === '?') this.gotoHelp('title');
      else if (k === 'm') { this.audio.muted = !this.audio.muted; this.save(); }
      else if (k === 'c') { this.crt = !this.crt; this.renderer.crt = this.crt ? 1 : 0; this.save(); }
      else if (k === 's') { this.seedPref = this.seedPref ? null : (Math.random() * 0xffffffff) >>> 0; this.save(); }
      else if (k === 'escape') { /* nothing above the title */ }
    }
    this.clickList(clicks, TITLE_ROWS, items);
  }

  levelInput(presses, clicks) {
    const items = this.items = this.menuItems();
    for (const k of presses) {
      if (k === 'ArrowUp') ui_(this, -1);
      else if (k === 'ArrowDown') ui_(this, 1);
      else if (k === 'enter' || k === 'space') { const it = items[this.ui.menu]; if (it && !it.locked) { this.audio.play('click'); it.action(); } }
      else if (k === 'p') { this.practice = !this.practice; this.save(); }
      else if (k === 'h' || k === '?') this.gotoHelp('levels');
      else if (k === 'escape') this.goto('title');
    }
    this.clickList(clicks, LEVEL_ROWS, items);
  }

  clickList(clicks, rows, items) {
    for (const c of clicks) {
      const k = rows.hit(c.x, c.y, items.length);
      if (k < 0) continue;
      this.ui.menu = k;
      const it = items[k];
      if (it && !it.locked) { this.audio.play('click'); it.action(); }
    }
  }

  helpInput(presses) {
    for (const k of presses) {
      if (k === 'escape' || k === 'h' || k === '?') this.backFromHelp();
      else if (k === 'ArrowRight' || k === 'd' || k === 'enter') this.ui.helpPage = (this.ui.helpPage + 1) % 3;
      else if (k === 'ArrowLeft' || k === 'a') this.ui.helpPage = (this.ui.helpPage + 2) % 3;
      else if (k === 'm') { this.audio.muted = !this.audio.muted; this.save(); }
      else if (k === 'c') { this.crt = !this.crt; this.renderer.crt = this.crt ? 1 : 0; this.save(); }
    }
  }

  postInput(presses, clicks) {
    const won = this.sim && this.sim.state === 'won';
    for (const k of presses) {
      if (k === 'enter' || k === 'space') {
        if (won && this.level.id !== 'ENDLESS' && this.level.id !== 'DAILY') {
          const i = LEVELS.indexOf(this.level);
          if (i >= 0 && i + 1 < LEVELS.length && this.unlocked(i + 1)) { this.startLevel(LEVELS[i + 1]); return; }
        }
        this.goto('levels'); return;
      }
      if (k === 'r') { this.startLevel(this.level, this.sim.seed); return; }
      if (k === 'q' || k === 'escape') { this.goto('levels'); return; }
      if (k === 'h' || k === '?') { this.gotoHelp('post'); return; }
      if (k === 'm') { this.audio.muted = !this.audio.muted; this.save(); }
    }
    if (clicks.length) {
      if (won && this.level.id !== 'ENDLESS' && this.level.id !== 'DAILY') {
        const i = LEVELS.indexOf(this.level);
        if (i >= 0 && i + 1 < LEVELS.length && this.unlocked(i + 1)) this.startLevel(LEVELS[i + 1]);
        else this.goto('levels');
      } else if (won) this.goto('levels');
      else this.startLevel(this.level, this.sim.seed);
    }
  }

  // ------------------------------------------------------------------ play input
  playInput(presses, clicks) {
    const ui = this.ui, sim = this.sim;
    for (const k of presses) {
      switch (k) {
        case 'escape':
          if (ui.placeKey) { ui.placeKey = null; }
          else if (ui.wireFrom >= 0) { ui.wireFrom = -1; ui.wireTo = -1; }
          else ui.sel = -1;
          break;
        case 'tab': {
          const list = this.level.unlock;
          ui.buildIdx = (ui.buildIdx + 1) % list.length;
          this.pickBuild(ui.buildIdx);
          break;
        }
        case 'enter':
          if (ui.placeKey) this.commitPlace();
          else if (ui.wireFrom >= 0) this.commitWire();
          else { const i = HUD.nearestNode(sim, ui.cursorX, ui.cursorY); if (i >= 0) ui.sel = i; }
          break;
        case 'space': this.paused = !this.paused; break;
        case 'w':
          ui.placeKey = null;                       // wiring replaces whatever was armed
          if (ui.sel < 0) { this.note('Select a node first (click it).'); break; }
          ui.wireFrom = ui.sel; ui.wireTo = -1;
          break;
        case 'u': this.op('upgrade', { i: ui.sel }); break;
        case 'x': this.op('remove', { i: ui.sel }); break;
        case 'a': {
          const n = sim.nodes;
          if (ui.sel < 0 || n.state[ui.sel] === 0) { this.note('Select a node to autoscale.'); break; }
          this.op('auto', { i: ui.sel, on: n.auto[ui.sel] ? 0 : 1 });
          break;
        }
        case 'l': ui.flow = !ui.flow; break;
        case '[': ui.flowType = (ui.flowType + TRAFFIC.length - 1) % TRAFFIC.length; break;
        case ']': ui.flowType = (ui.flowType + 1) % TRAFFIC.length; break;
        case '=':
        case '+': this.speed = SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(this.speed) + 1)] || 1; break;
        case '-': this.speed = SPEEDS[Math.max(0, SPEEDS.indexOf(this.speed) - 1)] || 1; break;
        case 'c': this.crt = !this.crt; this.renderer.crt = this.crt ? 1 : 0; this.save(); break;
        case 'm': this.audio.muted = !this.audio.muted; this.save(); break;
        case 'h': case '?': case 'F1': this.gotoHelp('play'); break;
        case 'r': this.confirm('Restart this shift from tick 0?', () => this.startLevel(this.level, sim.seed)); break;
        case 'q': this.confirm('Abandon the shift and go back to the level list?', () => this.goto('levels')); break;
        default: break;
      }
      // number keys pick build items
      if (k.length === 1 && k >= '0' && k <= '9') {
        const idx = (k === '0') ? 9 : (+k - 1);
        if (idx < this.level.unlock.length) this.pickBuild(idx);
      }
    }

    // held-key movement
    for (const [dx, dy] of this.input.movement()) {
      if (ui.placeKey) {
        ui.cursorX = clampI(ui.cursorX + dx, 0, WORLD_W - NODE_W);
        ui.cursorY = clampI(ui.cursorY + dy, 0, WORLD_H - NODE_H);
        ui.followMouse = false;
      } else if (ui.wireFrom >= 0) {
        const from = ui.wireTo >= 0 ? ui.wireTo : ui.wireFrom;
        const t = HUD.nodeInDirection(sim, from, dx, dy);
        if (t >= 0) ui.wireTo = t;
      } else {
        const from = ui.sel >= 0 ? ui.sel : sim.net;
        const t = HUD.nodeInDirection(sim, from, dx, dy);
        if (t >= 0) ui.sel = t;
      }
    }

    // mouse
    const m = this.input.mouse;
    if (m.moved) { this.ui.followMouse = true; m.moved = false; }
    if (m.inside) {
      const wx = m.cellX - HUD.BX, wy = m.cellY - HUD.BY;
      const onBoard = wx >= 0 && wy >= 0 && wx < WORLD_W && wy < WORLD_H;
      ui.hover = onBoard ? HUD.nodeAt(sim, wx, wy) : -1;
      if (onBoard && ui.placeKey && (m.moved || this.ui.followMouse)) {
        ui.cursorX = clampI(wx - 7, 0, WORLD_W - NODE_W);
        ui.cursorY = clampI(wy - 2, 0, WORLD_H - NODE_H);
      }
    }
    for (const c of clicks) {
      if (c.button === 2) { ui.placeKey = null; ui.wireFrom = -1; ui.wireTo = -1; continue; }
      // build panel
      if (c.x >= HUD.PX) {
        const k = c.y - (HUD.BUILD_Y + 1);
        if (k >= 0 && k < this.level.unlock.length) this.pickBuild(k);
        continue;
      }
      const wx = c.x - HUD.BX, wy = c.y - HUD.BY;
      if (wx < 0 || wy < 0 || wx >= WORLD_W || wy >= WORLD_H) continue;
      const i = HUD.nodeAt(sim, wx, wy);
      if (ui.wireFrom >= 0) {
        // wiring takes precedence: click any node that is not the source
        if (i >= 0 && i !== ui.wireFrom) { ui.wireTo = i; this.commitWire(); }
        continue;
      }
      if (ui.placeKey && i < 0) { this.commitPlace(); continue; }   // empty space: build
      ui.sel = i;                                                   // a node: select it (and keep building armed)
      if (i >= 0) this.audio.play('click');
    }
  }

  pickBuild(k) {
    const ui = this.ui;
    const key = (this.level.unlock || [])[k];
    if (!key) return;
    const def = NODES[NODE[key]];
    ui.buildIdx = k;
    ui.placeKey = key;
    ui.wireFrom = -1; ui.wireTo = -1;
    ui.followMouse = true;
    ui.cursorX = clampI(ui.cursorX, 0, WORLD_W - NODE_W);
    ui.cursorY = clampI(ui.cursorY, 0, WORLD_H - NODE_H);
    if (this.sim.money < def.cost) this.note(`not enough money: ${def.short} costs $${def.cost}`);
    this.audio.play('click');
  }

  commitPlace() {
    const ui = this.ui;
    if (!ui.placeKey) return;
    const res = this.sim.do('place', { type: ui.placeKey, x: ui.cursorX, y: ui.cursorY });
    if (res.ok) {
      ui.sel = res.i; ui.note = '';
      this.audio.play('place');
      const def = NODES[NODE[ui.placeKey]];
      if (this.sim.money < def.cost) this.note('out of money — sell something or wait for revenue');
    } else {
      this.note(res.err);
      this.audio.play('drop');
    }
  }

  commitWire() {
    const ui = this.ui, sim = this.sim;
    const a = ui.wireFrom, b = ui.wireTo;
    ui.wireFrom = -1; ui.wireTo = -1;
    if (a < 0 || b < 0 || a === b) return;
    const n = sim.nodes;
    if (sim.isConnected(a, b)) {
      const res = sim.do('disconnect', { a, b });
      this.note(res.ok ? `unwired ${NODES[n.type[a]].short} → ${NODES[n.type[b]].short}` : res.err);
    } else {
      const res = sim.do('connect', { a, b });
      this.note(res.ok ? `wired ${NODES[n.type[a]].short} → ${NODES[n.type[b]].short}` : res.err);
    }
    this.audio.play('wire');
  }

  op(op, args) {
    const ui = this.ui;
    if (op !== 'place' && (ui.sel < 0 || this.sim.nodes.state[ui.sel] === 0)) { this.note('Select a node first (click it).'); return; }
    const res = this.sim.do(op, args);
    if (!res.ok) this.note(res.err);
    else {
      const msg = op === 'upgrade' ? `graded to ${['T1', 'T2', 'T3'][Math.min(2, this.sim.nodes.tier[ui.sel])]}`
        : op === 'remove' ? 'sold' : op === 'auto' ? (this.sim.nodes.auto[ui.sel] ? 'autoscaling ON' : 'autoscaling OFF') : '';
      if (msg) this.note(msg);
      if (op === 'remove') ui.sel = -1;
      if (op === 'auto') this.audio.play('scale'); else this.audio.play('wire');
    }
  }

  // ------------------------------------------------------------------ loop
  frame(now) {
    const dt = Math.min(0.25, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    this.time += dt;
    const { presses, clicks } = this.input.take();
    if (presses.length || clicks.length) this.audio.ensure();
    this.handleInput(presses, clicks);

    if (this.screen === 'play' && !this.ui.confirm && !this.paused && this.sim.state === 'running') {
      this.acc += dt * SIM.TICK_RATE * this.speed;
      let steps = 0;
      while (this.acc >= 1 && steps < 24) { this.stepSim(); this.acc -= 1; steps++; }
      if (this.acc > 4) this.acc = 0;                        // never build an unbounded backlog
    }
    if (this.ui.note && this.time > (this.ui.noteUntil || 0)) this.ui.note = '';
    if (this.toast && this.sim && this.sim.tick > this.toast.until) this.toast = null;

    this.draw();
    requestAnimationFrame((t) => this.frame(t));
  }

  stepSim() {
    const t0 = performance.now();
    this.sim.step();
    const ms = performance.now() - t0;
    this.perfAcc += ms; this.perfN++;
    if (this.perfN >= 30) { this.perfMs = this.perfAcc / this.perfN; this.perfAcc = 0; this.perfN = 0; }

    if (this.sim.logSeq !== this.lastLogSeq) {
      this.lastLogSeq = this.sim.logSeq;
      const e = this.sim.log[this.sim.log.length - 1];
      if (e) {
        this.toast = { msg: e.msg, until: this.sim.tick + 300 };
        if (/DOWN|ATTACK|FLUSH|wakes|storm|crawls|crash/i.test(e.msg)) this.audio.play('alarm');
        else if (/scaled/i.test(e.msg)) this.audio.play('scale');
      }
    }
    if (this.sim.dropped > this.lastDropped) { this.lastDropped = this.sim.dropped; this.audio.play('drop'); }
    if (this.sim.tick % 30 === 0) this.hashHex = toHex8(this.sim.hash());
    if (this.sim.state !== 'running') this.onFinish();
  }

  onFinish() {
    const st = this.sim.stars();
    if (this.sim.state === 'won' && this.level.id !== 'ENDLESS' && this.level.id !== 'DAILY') {
      const prev = this.progress[this.level.id] || 0;
      if (st > prev) { this.progress[this.level.id] = st; this.save(); }
    }
    if (this.level.id === 'ENDLESS' || this.level.id === 'DAILY') {
      if (st > (this.progress[this.level.id] || 0)) { this.progress[this.level.id] = st; }
      this.save();
    }
    this.hashHex = toHex8(this.sim.hash());
    this.audio.play(this.sim.state === 'won' ? 'win' : 'lose');
    this.screen = 'post';
  }

  // ------------------------------------------------------------------ draw
  draw() {
    const g = {
      term: this.term, sim: this.sim, level: this.level, ui: this.ui, renderer: this.renderer,
      seedHex: this.seedHex, hashHex: this.hashHex, perfMs: this.perfMs, glInfo: this.glInfo, game: this,
      paused: this.paused, speed: this.speed, toast: this.toast,
      menuItems: this.screen === 'title' || this.screen === 'levels' ? (this.items = this.menuItems()) : [],
      progressWon: () => this.wonCount(), progressTotal: () => LEVELS.length,
      practice: this.practice, muted: this.audio.muted, crt: this.crt,
      seedText: this.seedPref ? '0x' + toHex8(this.seedPref) : 'per-shift (fixed)',
      textPackets: !!this.textPackets,
    };
    this.renderer.crt = this.crt ? 1 : 0;
    this.renderer.begin();
    if (this.screen === 'title') HUD.drawTitle(g);
    else if (this.screen === 'levels') HUD.drawLevelSelect(g);
    else if (this.sim) {
      HUD.drawFrame(g);
      if (this.screen === 'post') HUD.drawPostmortem(g);
    }
    if (this.screen === 'help') { this.term.clear(); HUD.drawHelp(g); }
    if (this.ui.confirm) this.drawConfirm();
    if (this.ui.note) this.drawNote();

    // cells first, then packet sprites on top
    for (let y = 0; y < HUD.ROWS; y++) {
      for (let x = 0; x < HUD.COLS; x++) {
        const i = y * HUD.COLS + x;
        this.renderer.cell(x, y, this.term.ch[i], this.term.fg[i], this.term.bg[i], this.term.bgi[i]);
      }
    }
    if (this.screen === 'play' && this.sim) HUD.drawPackets(g);
    this.renderer.flush(this.time);
  }

  drawConfirm() {
    const c = this.ui.confirm, term = this.term;
    const lines = c.text.split('\n');
    const w = Math.max(44, Math.max(...lines.map((l) => l.length)) + 8);
    const h = lines.length + 5;
    const x = (HUD.COLS - w) >> 1, y = (HUD.ROWS - h) >> 1;
    term.fill(x, y, w, h, ' ', PAL.bright, [0.02, 0.06, 0.04]);
    term.box(x, y, w, h, PAL.amber, [0.02, 0.06, 0.04], true);
    for (let k = 0; k < lines.length; k++) term.field(x + 2, y + 1 + k, lines[k], w - 4, PAL.bright, [0.02, 0.06, 0.04], 'center');
    const opts = '[ENTER/y] yes     [ESC/n] no';
    term.field(x + 2, y + h - 2, opts, w - 4, PAL.amber, [0.02, 0.06, 0.04], 'center');
  }

  drawNote() {
    const term = this.term;
    const w = Math.min(60, this.ui.note.length + 4);
    const x = HUD.PX + HUD.PW - w - 1, y = HUD.ROWS - 2;
    term.fill(x, y, w, 1, ' ', PAL.bright, [0.08, 0.02, 0.02]);
    term.field(x + 1, y, '⚠ ' + this.ui.note, w - 2, PAL.amber, [0.08, 0.02, 0.02]);
  }
}

// ------------------------------------------------------------------ helpers
function freshUi() {
  return {
    sel: -1, hover: -1, placeKey: null, buildIdx: 0, cursorX: 52, cursorY: 20, wireFrom: -1, wireTo: -1,
    menu: 0, helpPage: 0, flow: false, flowType: 1, confirm: null, note: '', noteUntil: undefined, followMouse: true,
  };
}
function ui_(game, d) {
  const items = game.items || [];
  if (!items.length) return;
  game.ui.menu = (game.ui.menu + d + items.length) % items.length;
  game.audio.play('click');
}
const TITLE_ROWS = { x: HUD.TITLE_MENU.x - 2, w: HUD.TITLE_MENU.w + 4, hit(cx, cy, n) { const k = (cy - HUD.TITLE_MENU.y) / HUD.TITLE_MENU.step; return Number.isInteger(k) && k >= 0 && k < n && cx >= this.x && cx < this.x + this.w ? k : -1; } };
const LEVEL_ROWS = { x: HUD.LS_MENU.x, w: HUD.LS_MENU.w, hit(cx, cy, n) { const k = cy - HUD.LS_MENU.y; return k >= 0 && k < n && cx >= this.x && cx < this.x + this.w ? k : -1; } };
function hashDate(d) {
  let h = 0x811c9dc5;
  const s = d.toISOString().slice(0, 10);
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
function loadSave() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {}; } catch (e) { return {}; }
}
function glRendererName(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).slice(0, 46) : 'WebGL2';
  } catch (e) { return 'WebGL2'; }
}

// ------------------------------------------------------------------ boot
function boot() {
  const canvas = document.getElementById('gl');
  try {
    const game = new Game(canvas);
    window.KERNEL_ARCHITECT = game;              // handy for tinkering in the console
    const bootEl = document.getElementById('boot');
    requestAnimationFrame(() => requestAnimationFrame(() => bootEl && bootEl.classList.add('hidden')));
  } catch (err) {
    const e = document.getElementById('err'), b = document.getElementById('boot');
    if (e) { document.getElementById('errtxt').textContent = 'KERNEL PANIC\n\n' + (err && err.stack ? err.stack : String(err)); e.classList.remove('hidden'); }
    if (b) b.classList.add('hidden');
  }
}
boot();
