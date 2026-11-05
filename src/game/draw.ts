import { REQ } from './content';
import { BOARD_H, BOARD_W, type Sim } from './sim';
import { inPort, outPort, wirePoint } from './geom';

/** Draws the flying requests. Pages are circles, data are rounded squares. */
export function drawPackets(canvas: HTMLCanvasElement, sim: Sim) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const ratio = canvas.width / BOARD_W;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, BOARD_W, BOARD_H);
  const wires = new Map(sim.wires.map((w) => [w.id, w]));
  for (const r of sim.reqs) {
    const w = wires.get(r.wire);
    if (!w) continue;
    const a = sim.node(w.from); const b = sim.node(w.to);
    if (!a || !b) continue;
    const p = wirePoint(outPort(a), inPort(b), Math.min(1, r.p));
    const color = REQ[r.type].color;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#0f1017';
    ctx.lineWidth = 2;
    if (r.type === 'page') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (r.type === 'bot') {
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 8); ctx.lineTo(p.x + 7, p.y); ctx.lineTo(p.x, p.y + 8); ctx.lineTo(p.x - 7, p.y); ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (r.type === 'vip') {
      // a golden, pulsing star
      const pulse = 1 + 0.18 * Math.sin(sim.t * 14 + r.id);
      ctx.shadowBlur = 20;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const rad = (i % 2 ? 4.5 : 11) * pulse;
        const a = -Math.PI / 2 + (i * Math.PI) / 5 + sim.t * 2;
        const px = p.x + Math.cos(a) * rad; const py = p.y + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      const s = 12;
      ctx.beginPath();
      ctx.roundRect(p.x - s / 2, p.y - s / 2, s, s, 3);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
