import { useState } from 'react';
import { sfx } from '../game/sfx';
import { cn } from '../utils/cn';
import { Icon } from './icons';

export function SoundToggle({ className }: { className?: string }) {
  const [muted, setMuted] = useState(sfx.muted);
  return (
    <button
      onClick={() => { sfx.unlock(); const m = !muted; sfx.setMuted(m); setMuted(m); if (!m) sfx.click(); }}
      title={muted ? 'Sound off. Click to turn on' : 'Sound on. Click to mute'}
      aria-label="Toggle sound"
      className={cn('flex h-7 w-7 items-center justify-center rounded-md text-dim hover:bg-line hover:text-fg', !muted && 'text-ok', className)}
    >
      <Icon name={muted ? 'speakerOff' : 'speaker'} size={16} />
    </button>
  );
}
