import type { ReactNode } from 'react';
import { cn } from '../utils/cn';
import { Icon, type IconName } from './icons';

/** The three window dots. Decorative unless handlers are passed. */
export function Dots({ onClose, onMin }: { onClose?: () => void; onMin?: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button aria-label="Close" onClick={onClose} className={cn('h-3 w-3 rounded-full bg-[#ff5f57]', onClose ? 'hover:brightness-125' : 'cursor-default')} />
      <button aria-label="Minimise" onClick={onMin} className={cn('h-3 w-3 rounded-full bg-[#febc2e]', onMin ? 'hover:brightness-125' : 'cursor-default')} />
      <span className="h-3 w-3 rounded-full bg-[#28c840]" />
    </div>
  );
}

/** A little editor-style tab. */
export function Tab({ icon, label, active, dirty, color = '#7aa2f7', onClick }: {
  icon: IconName; label: string; active?: boolean; dirty?: boolean; color?: string; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex h-8 items-center gap-2 border-r border-line px-3 text-[12px] transition-colors',
        active ? 'bg-ink text-fg' : 'bg-ink2 text-dim hover:text-fg',
      )}
    >
      {active && <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: color }} />}
      <Icon name={icon} size={13} style={{ color }} />
      <span className="whitespace-nowrap">{label}</span>
      {dirty && <span className="h-1.5 w-1.5 rounded-full bg-fg/60" />}
    </button>
  );
}

export function Btn({ children, onClick, tone = 'ok', icon, className, disabled, big, title }: {
  children?: ReactNode; onClick?: () => void; tone?: 'ok' | 'ghost' | 'gold' | 'bad'; icon?: IconName;
  className?: string; disabled?: boolean; big?: boolean; title?: string;
}) {
  const tones = {
    ok: 'bg-ok text-ink shadow-[0_4px_0_#3f9e4c,0_0_28px_rgba(126,231,135,0.25)] hover:brightness-110',
    gold: 'bg-gold text-ink shadow-[0_4px_0_#b88a10,0_0_28px_rgba(255,211,77,0.3)] hover:brightness-110',
    bad: 'bg-bad text-ink shadow-[0_4px_0_#b23a58] hover:brightness-110',
    ghost: 'border border-line bg-panel2 text-fg hover:border-blue hover:bg-line',
  };
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-extrabold tracking-wide transition-all active:translate-y-[3px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-40',
        big ? 'px-8 py-3.5 text-base' : 'px-4 py-2.5 text-sm',
        tones[tone], className,
      )}
    >
      {icon && <Icon name={icon} size={big ? 20 : 16} strokeWidth={2.2} />}
      {children}
    </button>
  );
}
