import { useEffect, useRef } from 'react';
import { fx } from '../game/particles';

/** One full-screen canvas that sits on top of everything and draws all reward particles. */
export function FxLayer() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    fx.attach(ref.current);
    const onResize = () => fx.resize();
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); fx.attach(null); };
  }, []);
  return <canvas ref={ref} className="fx-canvas pointer-events-none fixed left-0 top-0 z-[90]" />;
}
