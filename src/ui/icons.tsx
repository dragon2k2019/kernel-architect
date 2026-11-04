import type { CSSProperties, ReactNode } from 'react';
import type { Kind } from '../game/content';

// Custom vector icon set. Everything is drawn with SVG so it looks identical on every device
// (no emoji, no font glyphs). 24x24 grid, rounded strokes, soft duotone fill.

export type IconName =
  | 'globe' | 'server' | 'balancer' | 'database' | 'bolt'
  | 'play' | 'pause' | 'coin' | 'heart' | 'user' | 'target' | 'skull' | 'flame' | 'clock'
  | 'trophy' | 'star' | 'lock' | 'copy' | 'back' | 'terminal' | 'check' | 'x' | 'warn'
  | 'sparkle' | 'rotate' | 'help' | 'trash' | 'plug' | 'cursor' | 'file' | 'cube'
  | 'speaker' | 'speakerOff' | 'chevR' | 'chevL' | 'sprout' | 'trend' | 'news' | 'infinity'
  | 'rocket' | 'folder' | 'branch' | 'bell' | 'list' | 'bulb' | 'refresh' | 'skip' | 'loop' | 'wallet' | 'book';

const SOFT = 0.18;

const P: Record<IconName, ReactNode> = {
  globe: (
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity={SOFT} />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18M4.6 7.5h14.8M4.6 16.5h14.8" />
    </>
  ),
  server: (
    <>
      <rect x="3" y="3.5" width="18" height="7" rx="2" fill="currentColor" fillOpacity={SOFT} />
      <rect x="3" y="13.5" width="18" height="7" rx="2" fill="currentColor" fillOpacity={SOFT} />
      <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" />
      <circle cx="7" cy="17" r="1" fill="currentColor" stroke="none" />
      <path d="M12 7h5M12 17h5" />
    </>
  ),
  balancer: (
    <>
      <circle cx="5" cy="12" r="2.6" fill="currentColor" fillOpacity={0.35} />
      <circle cx="19" cy="5" r="2.2" fill="currentColor" fillOpacity={SOFT} />
      <circle cx="19" cy="12" r="2.2" fill="currentColor" fillOpacity={SOFT} />
      <circle cx="19" cy="19" r="2.2" fill="currentColor" fillOpacity={SOFT} />
      <path d="M7.6 12H10c3 0 3-7 6.8-7M10 12h6.8M10 12c3 0 3 7 6.8 7" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5.5" rx="8" ry="3" fill="currentColor" fillOpacity={0.3} />
      <path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13" fill="currentColor" fillOpacity={SOFT} />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </>
  ),
  bolt: <path d="M13.5 2.5 5 13.5h6l-1.2 8 8.7-11.5h-6z" fill="currentColor" fillOpacity={0.28} />,
  play: <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="currentColor" />,
  pause: (
    <>
      <rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" />
      <rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity={0.25} />
      <circle cx="12" cy="12" r="6" strokeOpacity={0.5} />
      <path d="M14.2 9.6c-.4-.9-1.2-1.4-2.2-1.4-1.2 0-2 .6-2 1.5 0 2.1 4.2 1 4.2 3.2 0 1-.9 1.6-2.2 1.6-1 0-1.8-.5-2.2-1.3M12 6.8v1.4M12 15.8v1.4" />
    </>
  ),
  heart: <path d="M12 20.5s-8-4.7-8-10.2A4.5 4.5 0 0 1 12 7.6a4.5 4.5 0 0 1 8 2.7c0 5.5-8 10.2-8 10.2z" fill="currentColor" fillOpacity={0.3} />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" fill="currentColor" fillOpacity={0.3} />
      <path d="M4 20.5c0-4.2 3.6-6.5 8-6.5s8 2.3 8 6.5" fill="currentColor" fillOpacity={SOFT} />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.2" fill="currentColor" fillOpacity={SOFT} />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
    </>
  ),
  skull: (
    <>
      <path d="M12 3c-4.4 0-8 3.2-8 7.5 0 2.4 1.1 4 2.5 5V19a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-3.5c1.4-1 2.5-2.6 2.5-5C20 6.2 16.4 3 12 3z" fill="currentColor" fillOpacity={SOFT} />
      <circle cx="9" cy="11" r="1.7" fill="currentColor" />
      <circle cx="15" cy="11" r="1.7" fill="currentColor" />
      <path d="M10.2 20v-2.6M13.8 20v-2.6" />
    </>
  ),
  flame: <path d="M12 2.5c1 3.5 5.5 5.5 5.5 11a5.5 5.5 0 0 1-11 0c0-2 .8-3.4 2-4.5.2 1.5.9 2.3 1.8 2.6C10 8.5 10.5 5 12 2.5z" fill="currentColor" fillOpacity={0.3} />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity={SOFT} />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" fill="currentColor" fillOpacity={0.3} />
      <path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v4M8 20h8" />
    </>
  ),
  star: <path d="M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z" fill="currentColor" fillOpacity={0.3} />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor" fillOpacity={SOFT} />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" fill="currentColor" fillOpacity={SOFT} />
      <path d="M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  terminal: (
    <>
      <rect x="2.5" y="4" width="19" height="16" rx="3" fill="currentColor" fillOpacity={SOFT} />
      <path d="M7 9.5l3 2.5-3 2.5M12.5 15h4.5" />
    </>
  ),
  check: <path d="M4.5 12.5l5 5L19.5 7" strokeWidth={2.4} />,
  x: <path d="M6 6l12 12M18 6L6 18" strokeWidth={2.2} />,
  warn: (
    <>
      <path d="M12 3.5l9.5 16.5h-19z" fill="currentColor" fillOpacity={SOFT} />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17.2" r=".6" fill="currentColor" />
    </>
  ),
  sparkle: (
    <>
      <path d="M11 3c.7 5 2.6 7 7.5 7.7-4.900.7-6.800 2.700-7.500 7.800-.7-5.100-2.600-7.100-7.500-7.800C8.400 10 10.300 8 11 3z" fill="currentColor" fillOpacity={0.3} />
      <path d="M19 15.500c.3 1.800 1 2.500 2.800 2.800-1.800.3-2.500 1-2.800 2.800-.3-1.800-1-2.500-2.800-2.800 1.800-.3 2.500-1 2.800-2.800z" fill="currentColor" />
    </>
  ),
  rotate: (
    <>
      <rect x="7" y="2.5" width="10" height="17" rx="2.500" fill="currentColor" fillOpacity={SOFT} />
      <path d="M3 17a9 9 0 0 0 9 5M21 17" />
      <path d="M2.500 13.500L3 17.500l4-.5" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity={SOFT} />
      <path d="M9.500 9.500a2.600 2.600 0 1 1 3.700 2.300c-.8.400-1.200 1-1.200 1.900" />
      <circle cx="12" cy="17" r=".7" fill="currentColor" />
    </>
  ),
  trash: (
    <>
      <path d="M4.500 6.500h15M9.500 6.500V4.500h5v2M6.500 6.500l1 13.500h9l1-13.500" fill="currentColor" fillOpacity={SOFT} />
      <path d="M10 10.500v6M14 10.500v6" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v5M15 3v5" />
      <path d="M6 8h12v3a6 6 0 0 1-12 0z" fill="currentColor" fillOpacity={SOFT} />
      <path d="M12 17v4" />
    </>
  ),
  cursor: <path d="M5 3.500l13 7-5.500 1.700L10.500 18z" fill="currentColor" fillOpacity={0.3} />,
  file: (
    <>
      <path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="currentColor" fillOpacity={SOFT} />
      <path d="M14 3v5h5M8 13h8M8 17h5" />
    </>
  ),
  cube: (
    <>
      <path d="M12 2.500l8.500 4.500v10L12 21.500 3.500 17V7z" fill="currentColor" fillOpacity={SOFT} />
      <path d="M3.500 7L12 11.500 20.500 7M12 11.500v10" />
    </>
  ),
  speaker: (
    <>
      <path d="M4 9.500v5h3.500l5 4v-13l-5 4z" fill="currentColor" fillOpacity={0.3} />
      <path d="M16 9a4.500 4.500 0 0 1 0 6M18.500 6.500a8 8 0 0 1 0 11" />
    </>
  ),
  speakerOff: (
    <>
      <path d="M4 9.500v5h3.500l5 4v-13l-5 4z" fill="currentColor" fillOpacity={SOFT} />
      <path d="M16.500 9.500l5 5M21.500 9.500l-5 5" />
    </>
  ),
  chevR: <path d="M9 5.500l6.500 6.500L9 18.500" />,
  chevL: <path d="M15 5.500L8.500 12l6.500 6.500" />,
  sprout: (
    <>
      <path d="M12 21v-8" />
      <path d="M12 13c0-4-3-6.500-7.500-6.500C4.500 10.500 7.500 13 12 13z" fill="currentColor" fillOpacity={0.3} />
      <path d="M12 15.500c0-3.500 2.500-5.500 7-5.500 0 3.500-2.500 5.500-7 5.500z" fill="currentColor" fillOpacity={0.3} />
    </>
  ),
  trend: <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  news: (
    <>
      <rect x="3" y="4.500" width="15" height="15" rx="2.500" fill="currentColor" fillOpacity={SOFT} />
      <path d="M18 8.500h1.500a1.500 1.500 0 0 1 1.500 1.500v7.500a2 2 0 0 1-2 2H6M7 9h7M7 12.500h7M7 16h4" />
    </>
  ),
  infinity: <path d="M12 12c-1.800-2.500-3.500-4-5.500-4a4 4 0 0 0 0 8c2 0 3.700-1.500 5.500-4zm0 0c1.800 2.500 3.500 4 5.500 4a4 4 0 0 0 0-8c-2 0-3.700 1.500-5.500 4z" fill="currentColor" fillOpacity={SOFT} />,
  rocket: (
    <>
      <path d="M12 2.500c3.500 2 5.500 5.500 5.500 9.500l-2.500 3h-6L6.500 12c0-4 2-7.500 5.500-9.500z" fill="currentColor" fillOpacity={SOFT} />
      <circle cx="12" cy="9.500" r="1.800" />
      <path d="M9 15l-2 4.500 3-1.500M15 15l2 4.500-3-1.500M12 17v4" />
    </>
  ),
  folder: <path d="M3 6.500A2.500 2.500 0 0 1 5.500 4H10l2 2.500h6.500A2.500 2.500 0 0 1 21 9v8.500a2.500 2.500 0 0 1-2.500 2.500h-13A2.500 2.500 0 0 1 3 17.500z" fill="currentColor" fillOpacity={SOFT} />,
  branch: (
    <>
      <circle cx="6.500" cy="5.500" r="2" />
      <circle cx="6.500" cy="18.500" r="2" />
      <circle cx="17.500" cy="8.500" r="2" />
      <path d="M6.500 7.500v9M17.500 10.500c0 4-6 3-10 6" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16.500V11a6 6 0 0 1 12 0v5.500l1.500 2h-15z" fill="currentColor" fillOpacity={SOFT} />
      <path d="M10 21h4" />
    </>
  ),
  list: (
    <>
      <path d="M9.500 6.500H20M9.500 12H20M9.500 17.500H20" />
      <path d="M3.500 6.500l1 1 2-2M3.500 12l1 1 2-2M3.500 17.500l1 1 2-2" />
    </>
  ),
  bulb: (
    <>
      <path d="M12 3a6 6 0 0 0-3.500 10.900c.6.500 1 1.200 1 2.100h5c0-.9.400-1.600 1-2.100A6 6 0 0 0 12 3z" fill="currentColor" fillOpacity={0.3} />
      <path d="M9.500 18.500h5M10.500 21h3" />
    </>
  ),
  refresh: <path d="M20 12a8 8 0 1 1-2.500-5.800M20 4v4.500h-4.500" />,
  skip: (
    <>
      <path d="M5 5l9 7-9 7z" fill="currentColor" fillOpacity={0.3} />
      <path d="M18 5v14" />
    </>
  ),
  loop: <path d="M17 3l3 3-3 3M4 11V9.500A3.500 3.500 0 0 1 7.500 6H20M7 21l-3-3 3-3M20 13v1.500a3.500 3.500 0 0 1-3.500 3.500H4" />,
  wallet: (
    <>
      <path d="M4 7.500A2.500 2.500 0 0 1 6.500 5H18a1.500 1.500 0 0 1 1.500 1.500V8" />
      <rect x="3" y="7.500" width="18" height="12" rx="2.500" fill="currentColor" fillOpacity={SOFT} />
      <circle cx="16.500" cy="13.500" r="1.200" fill="currentColor" />
    </>
  ),
  book: (
    <>
      <path d="M4 5.500A2.500 2.500 0 0 1 6.500 3H20v16H6.500A2.500 2.500 0 0 0 4 21.500z" fill="currentColor" fillOpacity={SOFT} />
      <path d="M4 5.500v16M8.500 8h7M8.500 11.500h5" />
    </>
  ),
};

export function Icon({ name, size = 18, className, style, strokeWidth = 1.8 }: {
  name: IconName; size?: number; className?: string; style?: CSSProperties; strokeWidth?: number;
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={{ flexShrink: 0, ...style }} aria-hidden
    >
      {P[name]}
    </svg>
  );
}

export const KIND_ICON: Record<Kind, IconName> = {
  internet: 'globe', server: 'server', lb: 'balancer', db: 'database', cache: 'bolt',
};

export function NodeIcon({ kind, size = 24, color, glow = true, className }: {
  kind: Kind; size?: number; color: string; glow?: boolean; className?: string;
}) {
  return (
    <Icon
      name={KIND_ICON[kind]} size={size} className={className}
      style={{ color, filter: glow ? `drop-shadow(0 0 6px ${color}88)` : undefined }}
    />
  );
}

export type Mood = 'sleep' | 'happy' | 'sweat' | 'hot' | 'dead';

const FACE: Record<Mood, string> = {
  sleep: '#7aa2f7', happy: '#ffd34d', sweat: '#ffb04d', hot: '#ff6b6b', dead: '#8d93b0',
};

/** Little vector faces that show how a box is coping. */
export function Face({ mood, size = 20, className }: { mood: Mood; size?: number; className?: string }) {
  const ink = '#14151f';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10.500" fill={FACE[mood]} />
      {mood === 'sleep' && (
        <>
          <path d="M6.500 10.500q2 1.800 4 0M13.500 10.500q2 1.800 4 0" stroke={ink} strokeWidth="1.700" fill="none" strokeLinecap="round" />
          <path d="M9.500 16.500h5" stroke={ink} strokeWidth="1.700" strokeLinecap="round" />
        </>
      )}
      {mood === 'happy' && (
        <>
          <circle cx="8.500" cy="10" r="1.500" fill={ink} />
          <circle cx="15.500" cy="10" r="1.500" fill={ink} />
          <path d="M7.500 14q4.500 4.500 9 0" stroke={ink} strokeWidth="1.700" fill="none" strokeLinecap="round" />
        </>
      )}
      {mood === 'sweat' && (
        <>
          <circle cx="8.500" cy="10" r="1.500" fill={ink} />
          <circle cx="15.500" cy="10" r="1.500" fill={ink} />
          <path d="M8 16q2-1.500 4 0t4 0" stroke={ink} strokeWidth="1.700" fill="none" strokeLinecap="round" />
          <path d="M19 4.500q2 2.600 0 4.200-2-1.600 0-4.200z" fill="#7dcfff" />
        </>
      )}
      {mood === 'hot' && (
        <>
          <path d="M6.500 8.500l4 1.500M17.500 8.500l-4 1.500" stroke={ink} strokeWidth="1.700" strokeLinecap="round" />
          <circle cx="8.500" cy="11.500" r="1.300" fill={ink} />
          <circle cx="15.500" cy="11.500" r="1.300" fill={ink} />
          <ellipse cx="12" cy="17" rx="3" ry="2.200" fill={ink} />
        </>
      )}
      {mood === 'dead' && (
        <>
          <path d="M6.500 8.500l4 4M10.500 8.500l-4 4M13.500 8.500l4 4M17.500 8.500l-4 4" stroke={ink} strokeWidth="1.700" strokeLinecap="round" />
          <path d="M8.500 17q3.500-2.500 7 0" stroke={ink} strokeWidth="1.700" fill="none" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** Legend glyphs for the two kinds of visitor: pages are circles, data are rounded squares. */
export function ReqDot({ type, color, size = 10 }: { type: 'page' | 'data'; color: string; size?: number }) {
  return type === 'page'
    ? <span className="inline-block rounded-full" style={{ width: size, height: size, background: color, boxShadow: `0 0 8px ${color}` }} />
    : <span className="inline-block rounded-[3px]" style={{ width: size, height: size, background: color, boxShadow: `0 0 8px ${color}` }} />;
}
