import { useEffect, useState, type CSSProperties } from 'react';

const HREF = 'https://myspec.dev/?utm_source=kernelarchitect&utm_medium=badge&utm_campaign=builtwith';
const STORE = 'kernel-architect.badge-theme';

export type BadgeTheme = 'dark' | 'light';

const THEMES: Record<BadgeTheme, { bg: string; border: string; borderHover: string; label: string; cta: string; ctaBg: string; ctaBorder: string; shadow: string; shadowHover: string }> = {
  dark: {
    bg: 'rgb(14, 16, 28)',
    border: 'rgba(125, 207, 247, 0.28)',
    borderHover: 'rgba(125, 207, 247, 0.7)',
    label: '#8b93b8',
    cta: '#7dd3fc',
    ctaBg: 'rgba(56, 189, 248, 0.12)',
    ctaBorder: 'rgba(56, 189, 248, 0.45)',
    shadow: '0 8px 25px rgba(0, 0, 0, 0.55)',
    shadowHover: '0 12px 35px rgba(56, 189, 248, 0.28)',
  },
  light: {
    bg: 'rgb(255, 255, 255)',
    border: 'rgba(99, 102, 241, 0.22)',
    borderHover: 'rgba(99, 102, 241, 0.6)',
    label: '#64748b',
    cta: '#4f46e5',
    ctaBg: 'rgba(99, 102, 241, 0.08)',
    ctaBorder: 'rgba(99, 102, 241, 0.35)',
    shadow: '0 8px 25px rgba(15, 23, 42, 0.18)',
    shadowHover: '0 12px 35px rgba(99, 102, 241, 0.3)',
  },
};

function load(fallback: BadgeTheme): BadgeTheme {
  try {
    const v = localStorage.getItem(STORE);
    if (v === 'dark' || v === 'light') return v;
  } catch { /* ignore */ }
  return fallback;
}

/**
 * "Built with MySpec" badge, pinned to the bottom-right corner.
 * Comes in a dark and a light version. `theme` sets the starting version (default: dark, to match the game);
 * the small switch next to the badge lets players flip it and remembers the choice.
 */
export function MySpecBadge({ theme = 'dark', className }: { theme?: BadgeTheme; className?: string }) {
  const [mode, setMode] = useState<BadgeTheme>(() => load(theme));
  const [hover, setHover] = useState(false);
  useEffect(() => { setMode(load(theme)); }, [theme]);
  const t = THEMES[mode];

  const flip = () => {
    const next: BadgeTheme = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    try { localStorage.setItem(STORE, next); } catch { /* ignore */ }
  };

  const wrap: CSSProperties = {
    position: 'fixed', bottom: 16, right: 16, zIndex: 9999, pointerEvents: 'none',
    display: 'flex', alignItems: 'center', gap: 6,
  };
  const link: CSSProperties = {
    pointerEvents: 'auto',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: 220, height: 48,
    background: t.bg,
    border: `2px solid ${hover ? t.borderHover : t.border}`,
    borderRadius: 10, padding: '0 12px',
    fontFamily: 'Nunito, sans-serif', textDecoration: 'none',
    boxShadow: hover ? t.shadowHover : t.shadow,
    transition: '0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    transform: hover ? 'translateY(-3px)' : 'none',
  };
  const swap: CSSProperties = {
    pointerEvents: 'auto', width: 22, height: 22, borderRadius: 999, border: `1px solid ${t.border}`,
    background: t.bg, color: t.label, cursor: 'pointer', padding: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: hover ? 1 : 0.55, transition: 'opacity .2s',
  };

  return (
    <div style={wrap} className={className} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button type="button" style={swap} onClick={flip} aria-label={`Switch badge to ${mode === 'dark' ? 'light' : 'dark'} version`} title={`${mode === 'dark' ? 'Light' : 'Dark'} badge`}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          {mode === 'dark'
            ? (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>)
            : <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
        </svg>
      </button>
      <a href={HREF} target="_blank" rel="nofollow noopener" style={link}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2 }}>
          <span style={{ fontSize: 9, color: t.label, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800, lineHeight: 1 }}>
            Built with
          </span>
          <img
            src="https://myspec.dev/LogoText.png"
            alt="MySpec"
            style={{ height: 15, width: 'auto', display: 'block', objectFit: 'contain' }}
          />
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: t.ctaBg, border: `1.5px solid ${t.ctaBorder}`, borderRadius: 6, padding: '4px 10px',
            fontSize: 10, color: t.cta, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em',
          }}
        >
          Explore
        </div>
      </a>
    </div>
  );
}
