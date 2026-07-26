import { Pause, Play } from 'lucide-react';
import { IconButton } from '../ui/Button';

interface TransportBarProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  /** 0.5, 1, 2, etc. */
  speed: number;
  onSpeedChange: (speed: number) => void;
  /** Formatted time string, e.g. "00:42" */
  currentLabel: string;
  totalLabel: string;
}

const SPEEDS = [0.5, 1, 2];

export function TransportBar({ isPlaying, onTogglePlay, speed, onSpeedChange, currentLabel, totalLabel }: TransportBarProps) {
  return (
    <div className="flex items-center gap-3">
      <IconButton variant="inverse" size="sm" title={isPlaying ? 'Pause' : 'Play'} aria-label={isPlaying ? 'Pause' : 'Play'} onClick={onTogglePlay}>
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </IconButton>

      <span className="font-mono text-[11px] tabular-nums text-white/70 min-w-[4rem]">
        {currentLabel}
      </span>

      <span className="font-mono text-[10px] text-white/40 tabular-nums">
        / {totalLabel}
      </span>

      <div className="h-5 w-px bg-white/10" />

      <div className="flex gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeedChange(s)}
            className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] tabular-nums transition ${
              s === speed
                ? 'bg-white/10 text-white'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
