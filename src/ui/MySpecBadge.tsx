import { useState, type CSSProperties } from 'react';

const HREF = 'https://myspec.dev/?utm_source=kernelarchitect&utm_medium=badge&utm_campaign=builtwith';

export function MySpecBadge({ className }: { className?: string }) {
  const [hover, setHover] = useState(false);

  const link: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: 220,
    height: 48,
    background: 'rgb(255, 252, 248)',
    border: `2px solid ${hover ? '#ffb6c1' : '#fde0e6'}`,
    borderRadius: 10,
    padding: '0 12px',
    fontFamily: 'Nunito, sans-serif',
    textDecoration: 'none',
    boxShadow: hover ? '0 12px 35px rgba(255, 182, 193, 0.5)' : '0 8px 25px rgba(255, 182, 193, 0.35)',
    transition: '0.3s cubic-bezier(0.16, 1, 0.3, 1)',
    transform: hover ? 'translateY(-3px)' : 'none',
  };

  return (
    <a
      href={HREF}
      target="_blank"
      rel="nofollow noopener"
      className={className}
      style={link}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 2 }}>
        <span style={{ fontSize: 9, color: '#fb7185', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 800, lineHeight: 1 }}>
          Built with
        </span>
        <img
          src="https://myspec.dev/LogoText.png"
          alt="MySpec Logo"
          style={{ height: 15, width: 'auto', display: 'block', objectFit: 'contain', filter: 'hue-rotate(320deg) brightness(1.2)' }}
        />
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ffe4e6',
          border: '1.5px solid #fda4af',
          borderRadius: 6,
          padding: '4px 10px',
          fontSize: 10,
          color: '#e11d48',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          transition: 'all 0.2s ease',
        }}
      >
        Explore
      </div>
    </a>
  );
}
