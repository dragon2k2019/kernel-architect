import { useCallback, useEffect, useRef, useState } from 'react';
import { NODE_DEFS, type Level } from '../game/content';
import { FAIL_HELP, type Sim } from '../game/sim';
import { payout, STAR_BONUS } from '../game/store';
import { sfx } from '../game/sfx';
import { fx } from '../game/particles';
import { cn } from '../utils/cn';
import { Btn, Dots } from './Chrome';
import { Face, Icon, NodeIcon } from './icons';

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function Intro({ level, onStart, onBack }: { level: Level; onStart: () => void; onBack: () => void }) {
  const tool = level.newTool ? NODE_DEFS[level.newTool] : null;
  useEffect(() => { sfx.open(); }, []);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-3">
      <div className="max-h-full w-full max-w-sm animate-pop overflow-y-auto rounded-2xl border border-line bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.7)] scroll-thin">
        <div className="flex h-9 items-center gap-3 border-b border-line bg-ink2 px-3">
          <Dots onClose={onBack} />
          <div className="flex-1 text-center text-[11px] text-dim">new_task.md</div>
          <span className="w-10" />
        </div>
        <div className="p-6 text-center">
          <div className="text-[11px] uppercase tracking-[0.3em] text-dim">level {level.n}</div>
          <div className="mx-auto mt-3 flex h-16 w-16 animate-bob items-center justify-center rounded-2xl border border-line bg-ink text-gold shadow-[0_0_32px_rgba(255,211,77,0.2)]">
            <Icon name={level.icon} size={34} />
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-tight">{level.name}</h2>
          <p className="mt-2 text-[14px] text-fg/90">{level.blurb}</p>

          <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-ok/30 bg-ink px-4 py-2.5 text-[13px]">
            <Icon name="target" size={16} className="text-ok" /><b>{level.goalText}</b>
          </div>

          {tool && (
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-dashed px-4 py-3 text-left" style={{ borderColor: tool.color + '88' }}>
              <NodeIcon kind={tool.kind} size={30} color={tool.color} />
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest text-ok">new box unlocked</div>
                <div className="text-sm font-bold">{tool.label}</div>
              </div>
            </div>
          )}

          <Btn big tone="ok" icon="rocket" onClick={onStart} className="mt-6 w-full">Start level</Btn>
          <button onClick={onBack} className="mt-3 inline-flex items-center gap-1.5 text-xs text-dim hover:text-fg"><Icon name="back" size={13} /> menu</button>
        </div>
      </div>
    </div>
  );
}

interface Step { label: string; fail?: boolean }

export function Result({ sim, prevBest, prevBank, hasNext, onNext, onRetry, onMenu }: {
  sim: Sim; prevBest: number; prevBank: number; hasNext: boolean; onNext: () => void; onRetry: () => void; onMenu: () => void;
}) {
  const won = sim.status === 'won';
  const endless = !!sim.level.endless;
  const record = endless && sim.ok > prevBest && sim.ok > 0;
  const celebrate = won || record;
  const pay = payout(sim);
  const top = sim.topFailCode;

  const plan: Step[] = won
    ? [{ label: 'lint config' }, { label: 'run load tests' }, { label: 'build release' }, { label: 'deploy to production' }]
    : endless
      ? [{ label: 'collect logs' }, { label: 'replay traffic' }, { label: 'write postmortem' }]
      : [{ label: 'lint config' }, { label: 'run load tests', fail: true }];

  const [running, setRunning] = useState(-1);
  const [doneN, setDoneN] = useState(0);
  const [boom, setBoom] = useState(false);
  const [starsShown, setStarsShown] = useState(0);
  const [showPay, setShowPay] = useState(false);
  const [rev, setRev] = useState(0);
  const [bon, setBon] = useState(0);
  const [showTotal, setShowTotal] = useState(false);
  const [bank, setBank] = useState(prevBank);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  const timers = useRef<number[]>([]);
  const starRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const totalRef = useRef<HTMLDivElement>(null);
  const bankRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const later = useCallback((ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); }, []);
  const clearAll = useCallback(() => { timers.current.forEach((id) => { clearTimeout(id); clearInterval(id); }); timers.current = []; }, []);

  const tween = useCallback((to: number, ms: number, set: (v: number) => void, then?: () => void) => {
    if (to <= 0) { set(0); then?.(); return; }
    const t0 = performance.now();
    let i = 0;
    const id = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      set(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (i++ % 2 === 0) sfx.tick(Math.floor(k * 14));
      if (k >= 1) { clearInterval(id); then?.(); }
    }, 45);
    timers.current.push(id);
  }, []);

  const center = (el: HTMLElement | null) => {
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: fx.w / 2, y: fx.h / 2 };
  };

  const payoutSeq = useCallback(() => {
    setShowPay(true);
    tween(pay.revenue, 1100, setRev, () => {
      const finish = () => {
        setShowTotal(true);
        if (pay.total > 0) {
          sfx.kaching(celebrate ? 1 : 0.5);
          const from = center(totalRef.current);
          const to = center(bankRef.current);
          fx.sparks(from.x, from.y, '#ffd34d', 24, 340);
          fx.coinFly(from.x, from.y, to.x, to.y, celebrate ? 14 : 6);
        }
        later(500, () => tween(pay.total, 900, (v) => setBank(prevBank + v), () => later(350, () => setDone(true))));
        if (pay.total === 0) setDone(true);
      };
      if (pay.bonus > 0) later(300, () => { sfx.milestone(); tween(pay.bonus, 800, setBon, () => later(350, finish)); });
      else later(250, finish);
    });
  }, [pay.revenue, pay.bonus, pay.total, celebrate, prevBank, tween, later]);

  const reveal = useCallback(() => {
    setBoom(true);
    const w = fx.w; const h = fx.h;
    if (celebrate) {
      sfx.boom();
      later(100, () => sfx.fanfare());
      const tc = center(titleRef.current);
      fx.swirl(w / 2, Math.max(120, tc.y), 140, 6);
      sfx.swirl();
      fx.confetti(0, h, -62, 80, 1);
      fx.confetti(w, h, -118, 80, 1);
      sfx.pop(); later(160, () => sfx.pop());
      fx.coinFountain(w * 0.12, 3.2, 26, -78);
      fx.coinFountain(w * 0.88, 3.2, 26, -102);
      sfx.coinShower(3.4, 12);
      later(600, () => fx.confettiRain(3, 30));
      later(1200, () => fx.cashRain(2.5, 7));
      if (sim.stars === 3 || record) {
        later(1000, () => { fx.cashFountain(w * 0.5, 2.5, 8); sfx.kaching(0.8); fx.confetti(w / 2, h, -90, 70, 0.9, 30); sfx.pop(); });
      }
    } else {
      sfx.lose(); sfx.glitch();
      const c = center(titleRef.current);
      fx.embers(c.x, c.y, 40);
      fx.ring(c.x, c.y, '#ff6b8b', 420, 0.9);
    }
    const s0 = celebrate && !endless ? 1100 : 500;
    if (!endless) {
      for (let i = 0; i < 3; i++) {
        later(s0 + i * 800, () => {
          setStarsShown(i + 1);
          if (i < sim.stars && won) {
            sfx.star(i);
            const c = center(starRefs.current[i]);
            fx.sparks(c.x, c.y, '#ffd34d', 26 + i * 8, 360);
            fx.ring(c.x, c.y, '#ffd34d', 180 + i * 40, 0.7);
            if (i === 2) { fx.confetti(c.x, c.y, -90, 60, 0.8, 55); fx.swirl(c.x, c.y, 80, 4); sfx.swirl(); }
          } else sfx.starEmpty();
        });
      }
    }
    const t1 = s0 + (endless ? 200 : 3 * 800 + 100);
    later(t1, payoutSeq);
  }, [celebrate, endless, record, sim.stars, won, later, payoutSeq]);

  const skip = useCallback(() => {
    if (done) return;
    clearAll();
    setRunning(plan.length); setDoneN(plan.length); setBoom(true); setStarsShown(3);
    setShowPay(true); setRev(pay.revenue); setBon(pay.bonus); setShowTotal(true);
    setBank(prevBank + pay.total); setDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, pay.revenue, pay.bonus, pay.total, prevBank, clearAll]);

  useEffect(() => {
    const stepMs = celebrate ? 560 : 440;
    if (celebrate) sfx.suspense();
    plan.forEach((s, i) => {
      later(300 + i * stepMs, () => { setRunning(i); sfx.step(i); });
      later(300 + i * stepMs + stepMs - 80, () => { setDoneN(i + 1); if (s.fail) sfx.error(); else sfx.stepDone(i); });
    });
    later(300 + plan.length * stepMs + 250, reveal);
    return clearAll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (!done && (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); skip(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [done, skip]);

  const errs = Object.entries(sim.byCode).filter(([c]) => c !== '200').map(([c, n]) => `${c}x${n}`).join(' ') || 'none';
  const report = [
    `KERNEL ARCHITECT | ${endless ? 'Production (endless)' : `L${sim.level.n} ${sim.level.name}`}`,
    endless
      ? `uptime ${mmss(sim.t)} | served ${sim.ok} | p95 ${Math.round(sim.p95)}ms | errors ${errs}`
      : `${won ? `DEPLOYED ${sim.stars}/3 stars` : 'OUTAGE'} | uptime ${(sim.uptime * 100).toFixed(1)}% | p95 ${Math.round(sim.p95)}ms | errors ${errs}`,
  ].join('\n');
  const copy = async () => {
    try { await navigator.clipboard.writeText(report); setCopied(true); sfx.click(); setTimeout(() => setCopied(false), 1600); } catch { /* ignore */ }
  };

  const title = endless ? (record ? 'NEW RECORD' : `Down after ${mmss(sim.t)}`) : won ? 'DEPLOYED' : 'OUTAGE';
  const pct = ((won || !plan.some((p) => p.fail) ? doneN : Math.min(doneN, 1)) / plan.length) * 100;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-black/80 p-3">
      {boom && <div className={cn('flash pointer-events-none absolute inset-0 z-10', celebrate ? 'bg-white' : 'bg-bad')} />}
      {boom && <div className={cn('pointer-events-none absolute left-1/2 top-1/2 h-[1100px] w-[1100px] animate-rays will-change-transform', celebrate ? 'rays' : 'rays-bad')} />}

      <div className={cn(
        'relative z-20 flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl border bg-panel shadow-[0_30px_90px_rgba(0,0,0,0.8)]',
        boom && !celebrate && 'animate-glitch',
        !boom ? 'border-line' : celebrate ? 'border-gold/60' : 'border-bad/60',
      )}>
        <div className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-ink2 px-3">
          <Dots />
          <div className="flex-1 text-center text-[11px] text-dim">deploy.sh {boom ? (celebrate ? '- exit 0' : '- exit 1') : '- running'}</div>
          {!done && <button onClick={skip} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-dim hover:bg-line hover:text-fg"><Icon name="skip" size={12} /> skip</button>}
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5 text-center">
          {/* headline */}
          <div className="flex min-h-[64px] items-center justify-center">
            {boom ? (
              <h2 ref={titleRef} className={cn('animate-slam text-[38px] font-black leading-none tracking-tight sm:text-5xl', celebrate ? 'gold-text' : 'text-bad')}>
                {title}
              </h2>
            ) : (
              <h2 ref={titleRef} className="text-xl font-black tracking-tight text-fg">
                {endless ? 'Analysing outage' : 'Deploying'}<span className="animate-blink">...</span>
              </h2>
            )}
          </div>
          {boom && !endless && !won && <p className="mt-1 text-[12px] text-dim">The site went down. It happens to everyone.</p>}
          {boom && celebrate && !endless && <p className="mt-1 animate-fadeup text-[12px] text-dim">Your system survived. The internet thanks you.</p>}

          {/* pipeline */}
          <div className="mt-4 rounded-xl border border-line bg-ink px-3.5 py-3 text-left text-[12px] leading-6">
            <div className="text-dim">$ ./deploy --prod</div>
            {plan.map((s, i) => {
              const finished = doneN > i;
              const active = running === i && !finished;
              if (running < i && !finished) return null;
              return (
                <div key={s.label} className="flex items-center gap-2.5" style={{ animation: 'slidein .25s ease-out both' }}>
                  <span className="flex h-4 w-4 items-center justify-center">
                    {finished ? (
                      <Icon name={s.fail ? 'x' : 'check'} size={14} className={s.fail ? 'text-bad' : 'text-ok'} strokeWidth={2.6} />
                    ) : active ? (
                      <span className="block h-3 w-3 animate-spin-slow rounded-full border-2 border-gold border-t-transparent" />
                    ) : null}
                  </span>
                  <span className={finished ? (s.fail ? 'text-bad' : 'text-fg') : 'text-gold'}>{s.label}</span>
                  {finished && !s.fail && <span className="ml-auto text-[10px] text-dim">ok</span>}
                  {finished && s.fail && <span className="ml-auto text-[10px] text-bad">failed</span>}
                </div>
              );
            })}
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className={cn('h-full rounded-full transition-[width] duration-500', boom && !celebrate ? 'bg-bad' : 'bg-gradient-to-r from-cyan to-ok')}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* stars */}
          {boom && !endless && (
            <div className="mt-4 flex items-center justify-center gap-2">
              {[0, 1, 2].map((i) => {
                const shown = starsShown > i;
                const earned = won && i < sim.stars;
                return (
                  <span
                    key={i}
                    ref={(el) => { starRefs.current[i] = el; }}
                    className={cn('flex h-[58px] w-[58px] items-center justify-center', shown && 'animate-star')}
                  >
                    <Icon
                      name="star" size={shown ? 54 : 44} strokeWidth={1.5}
                      className={cn(shown && earned ? 'text-gold' : 'text-line')}
                      style={shown && earned ? { filter: 'drop-shadow(0 0 14px rgba(255,211,77,0.9))', fill: '#ffd34d' } : { fill: shown ? '#1d2030' : 'none', opacity: shown ? 1 : 0.5 }}
                    />
                  </span>
                );
              })}
            </div>
          )}

          {/* stats */}
          {boom && (
            <div className="mt-4 grid animate-fadeup grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-ink px-2 py-2"><div className="text-[10px] uppercase tracking-wider text-dim">served</div><b className="text-lg text-ok">{sim.ok}</b></div>
              <div className="rounded-xl bg-ink px-2 py-2"><div className="text-[10px] uppercase tracking-wider text-dim">uptime</div><b className={cn('text-lg', sim.uptime >= 0.99 ? 'text-ok' : sim.uptime >= 0.95 ? 'text-warn' : 'text-bad')}>{(sim.uptime * 100).toFixed(1)}%</b></div>
              <div className="rounded-xl bg-ink px-2 py-2"><div className="text-[10px] uppercase tracking-wider text-dim">p95</div><b className="text-lg text-fg">{Math.round(sim.p95)}<span className="text-xs text-dim">ms</span></b></div>
            </div>
          )}
          {boom && endless && <p className="mt-2 text-[12px] text-dim">best: <b className="text-gold">{Math.max(prevBest, sim.ok)}</b> served{record && ' (new!)'}</p>}

          {!won && boom && top && FAIL_HELP[top] && (
            <p className="mt-3 flex animate-fadeup gap-2 rounded-xl bg-bad/10 px-3.5 py-2.5 text-left text-xs text-bad">
              <Icon name="bulb" size={15} className="mt-0.5" /><span><b>Most errors:</b> {FAIL_HELP[top]}</span>
            </p>
          )}
          {won && sim.stars < 3 && starsShown >= 3 && <p className="mt-2 text-[11.5px] text-dim">Want 3 stars? Keep uptime at 99% or better.</p>}

          {/* payout */}
          {showPay && (
            <div className="mt-4 animate-fadeup rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-left text-[12.5px]">
              <div className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-gold"><Icon name="coin" size={13} /> Payout</div>
              <div className="flex items-center justify-between py-0.5"><span className="text-dim">revenue earned</span><b className="text-fg">${rev}</b></div>
              {pay.bonus > 0 && (
                <div className="flex animate-fadeup items-center justify-between py-0.5">
                  <span className="flex items-center gap-1.5 text-dim">star bonus <span className="text-[10px]">({sim.stars} x ${STAR_BONUS})</span></span>
                  <b className="text-gold">+${bon}</b>
                </div>
              )}
              {showTotal && (
                <>
                  <div ref={totalRef} className="mt-1.5 flex animate-pop items-center justify-between border-t border-gold/30 pt-2">
                    <span className="font-bold text-fg">total</span>
                    <b className="text-xl text-gold" style={{ textShadow: '0 0 14px rgba(255,211,77,0.6)' }}>${pay.total}</b>
                  </div>
                  <div ref={bankRef} className="mt-1.5 flex items-center justify-between rounded-lg bg-ink px-2.5 py-1.5">
                    <span className="flex items-center gap-1.5 text-dim"><Icon name="wallet" size={14} /> wallet</span>
                    <b className="text-gold">${bank.toLocaleString()}</b>
                  </div>
                </>
              )}
            </div>
          )}

          {/* actions */}
          {done && (
            <div className="mt-5 animate-fadeup">
              <div className="flex gap-2">
                {won && hasNext ? (
                  <Btn tone="ok" icon="play" onClick={onNext} className="flex-1">Next level</Btn>
                ) : (
                  <Btn tone={won ? 'gold' : 'ok'} icon="refresh" onClick={onRetry} className="flex-1">{won ? 'Play again' : 'Try again'}</Btn>
                )}
                {won && hasNext && <Btn tone="ghost" icon="refresh" onClick={onRetry} title="Retry this level" />}
                <Btn tone="ghost" icon={copied ? 'check' : 'copy'} onClick={copy} title="Copy a shareable report">{copied ? 'Copied' : 'Share'}</Btn>
              </div>
              <button onClick={onMenu} className="mt-3 inline-flex items-center gap-1.5 text-xs text-dim hover:text-fg"><Icon name="back" size={13} /> menu</button>
            </div>
          )}
        </div>
      </div>
      {/* tiny face while loading */}
      {!boom && <div className="pointer-events-none absolute bottom-6 right-6 opacity-60"><Face mood="sweat" size={28} /></div>}
    </div>
  );
}
