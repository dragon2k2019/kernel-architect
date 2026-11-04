// The hands-on tutorial. One short script per level, played INSIDE the real game.
//
// Every step is locked: the screen is dimmed except for the spotlight "holes" named in `holes`
// (they match `data-tut` attributes in the UI). The player cannot go on until they do the thing,
// and "do" steps are verified against the live simulation, not against clicks.
import type { Kind } from './content';
import type { Sim } from './sim';
import type { IconName } from '../ui/icons';

export interface TutStep {
  id: string;
  icon: IconName;
  title: string;
  /** One short line. */
  body: string;
  /** Shows a small info card for this box (name, one-liner, cost, speed). */
  fact?: Kind;
  /** `data-tut` names to light up. Everything else is blocked. Empty = whole screen blocked. */
  holes?: string[];
  /**
   * next  = player taps the button.
   * do    = player must perform the action; `done` is checked against the simulation.
   * watch = nothing to do, advances by itself when `done` is true.
   */
  mode: 'next' | 'do' | 'watch';
  done?: (s: Sim) => boolean;
  btn?: string;
  /** Show a dashed "drop here" marker on the board. */
  drop?: boolean;
  /** Pause the simulation while this card is up. */
  freeze?: boolean;
  /** Keyboard keys still allowed during this step. */
  keys?: string[];
}

const kindOf = (s: Sim, id: number) => s.node(id)?.kind;
const count = (s: Sim, k: Kind) => s.nodes.filter((n) => n.kind === k).length;
const wired = (s: Sim, a: Kind, b: Kind) => s.wires.some((w) => kindOf(s, w.from) === a && kindOf(s, w.to) === b);
const outOf = (s: Sim, k: Kind) => s.wires.some((w) => kindOf(s, w.from) === k);
const running = (s: Sim) => s.status === 'running';

const RUN: TutStep = {
  id: 'run', icon: 'play', title: 'Press RUN', body: 'Send the visitors in.',
  holes: ['go'], mode: 'do', done: running, keys: [' '],
};

export const TUTORIALS: Record<string, TutStep[]> = {
  L1: [
    { id: 'hi', icon: 'sprout', title: "Let's put a site online", body: 'Visitors are on their way. Four quick moves.', mode: 'next', btn: "Let's go" },
    {
      id: 'place', icon: 'server', title: 'Drag in a Server', body: 'Pull it from the list onto the board.',
      fact: 'server', holes: ['tool-server', 'board'], drop: true, mode: 'do', done: (s) => count(s, 'server') >= 1,
    },
    {
      id: 'wire', icon: 'plug', title: 'Connect the Internet', body: 'Drag from the glowing dot to your Server.',
      fact: 'internet', holes: ['port-internet', 'node-server'], mode: 'do', done: (s) => wired(s, 'internet', 'server'),
    },
    RUN,
    { id: 'watch', icon: 'user', title: 'Here they come!', body: 'Every dot is a visitor.', holes: ['board'], mode: 'watch', done: (s) => s.ok >= 3 },
    { id: 'cash', icon: 'coin', title: 'Cash in', body: 'Each served visitor pays you.', holes: ['wallet'], mode: 'next', btn: 'Nice', freeze: true },
    { id: 'happy', icon: 'heart', title: 'Keep them happy', body: 'Failures drain this. At zero, the site is down.', holes: ['happy'], mode: 'next', btn: 'Got it', freeze: true },
    { id: 'goal', icon: 'target', title: 'Reach the goal', body: 'Serve 20 visitors to win.', holes: ['goal'], mode: 'next', btn: 'Finish', freeze: true },
  ],

  L2: [
    { id: 'hi', icon: 'trend', title: 'One Server is not enough', body: 'Add a Load Balancer to split the crowd.', fact: 'lb', mode: 'next', btn: 'Show me' },
    {
      id: 'lb', icon: 'balancer', title: 'Drop a Load Balancer', body: 'Drag it onto the board.',
      holes: ['tool-lb', 'board'], drop: true, mode: 'do', done: (s) => count(s, 'lb') >= 1,
    },
    {
      id: 'servers', icon: 'server', title: 'Add two Servers', body: 'Drop two, to the right of it.',
      holes: ['tool-server', 'board'], drop: true, mode: 'do', done: (s) => count(s, 'server') >= 2,
    },
    {
      id: 'in', icon: 'plug', title: 'Internet to Balancer', body: 'Drag from the Internet dot to the Load Balancer.',
      holes: ['port-internet', 'node-lb'], mode: 'do', done: (s) => wired(s, 'internet', 'lb'),
    },
    {
      id: 'fan', icon: 'branch', title: 'Fan it out', body: 'Wire the Balancer to both Servers.',
      holes: ['port-lb', 'node-server'], mode: 'do',
      done: (s) => s.wires.filter((w) => kindOf(s, w.from) === 'lb' && kindOf(s, w.to) === 'server').length >= 2,
    },
    RUN,
    { id: 'end', icon: 'bulb', title: 'Watch the queues', body: 'Red means overloaded. Add Servers as traffic grows.', mode: 'next', btn: 'Got it', freeze: true },
  ],

  L3: [
    { id: 'hi', icon: 'database', title: 'Some visitors want data', body: 'Servers fetch it from a Database. Square dots pay double.', fact: 'db', mode: 'next', btn: 'Show me' },
    {
      id: 'server', icon: 'server', title: 'You need a Server first', body: 'Drag one onto the board.',
      holes: ['tool-server', 'board'], drop: true, mode: 'do', done: (s) => count(s, 'server') >= 1,
    },
    {
      id: 'db', icon: 'database', title: 'Drop a Database', body: 'Put it to the right of your Server.',
      holes: ['tool-db', 'board'], drop: true, mode: 'do', done: (s) => count(s, 'db') >= 1,
    },
    {
      id: 'ask', icon: 'plug', title: 'Servers ask the Database', body: 'Wire your Server to the Database.',
      holes: ['port-server', 'node-db'], mode: 'do', done: (s) => wired(s, 'server', 'db'),
    },
    {
      id: 'in', icon: 'globe', title: 'Open the doors', body: 'Wire the Internet to your first box.',
      holes: ['port-internet', 'node-server', 'node-lb'], mode: 'do', done: (s) => outOf(s, 'internet'),
    },
    RUN,
  ],

  L4: [
    { id: 'hi', icon: 'bolt', title: "Don't repeat work", body: 'A Cache answers most visitors on the spot.', fact: 'cache', mode: 'next', btn: 'Show me' },
    {
      id: 'cache', icon: 'bolt', title: 'Drop a Cache', body: 'Put it near the Internet.',
      holes: ['tool-cache', 'board'], drop: true, mode: 'do', done: (s) => count(s, 'cache') >= 1,
    },
    {
      id: 'in', icon: 'plug', title: 'Internet to Cache', body: 'The Cache goes first in line.',
      holes: ['port-internet', 'node-cache'], mode: 'do', done: (s) => wired(s, 'internet', 'cache'),
    },
    {
      id: 'out', icon: 'branch', title: 'Cache to the rest', body: 'Misses go on to your Balancer or Servers.',
      holes: ['port-cache', 'node-lb', 'node-server'], mode: 'do', done: (s) => outOf(s, 'cache'),
    },
    RUN,
  ],

  // one-card heads-up for the later levels
  L5: [{ id: 'hi', icon: 'news', title: 'Traffic spike ahead', body: 'Twice, the crowd will triple. Cache plus spare Servers keeps you up.', mode: 'next', btn: 'Ready' }],
  L6: [{ id: 'hi', icon: 'skull', title: 'Boxes will crash', body: 'A crashed box reboots slowly. Keep a spare Server and a second Database.', mode: 'next', btn: 'Ready' }],
  L7: [{ id: 'hi', icon: 'infinity', title: 'No finish line', body: 'Stay online as long as you can. It only gets harder.', mode: 'next', btn: 'Ready' }],
};
