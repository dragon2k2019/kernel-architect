import { NODE_H, NODE_W } from './sim';

export interface P { x: number; y: number }

export const outPort = (n: P): P => ({ x: n.x + NODE_W, y: n.y + NODE_H / 2 });
export const inPort = (n: P): P => ({ x: n.x, y: n.y + NODE_H / 2 });

function ctrl(a: P, b: P) {
  const dx = Math.max(48, Math.abs(b.x - a.x) * 0.5);
  return { c1: { x: a.x + dx, y: a.y }, c2: { x: b.x - dx, y: b.y } };
}

export function wirePath(a: P, b: P): string {
  const { c1, c2 } = ctrl(a, b);
  return `M${a.x} ${a.y} C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`;
}

export function wirePoint(a: P, b: P, t: number): P {
  const { c1, c2 } = ctrl(a, b);
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * b.x,
    y: u * u * u * a.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * b.y,
  };
}
