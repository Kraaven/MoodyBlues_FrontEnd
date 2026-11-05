import type { ChangeEvent } from 'react';

export interface TimelineMarker {
  time: number;
  type: 'Spawn' | 'Delete';
}

interface TimelineScrubberProps {
  /** Current time in seconds. */
  value: number;
  /** Total duration in seconds. */
  max: number;
  onChange: (time: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  markers?: TimelineMarker[];
  disabled?: boolean;
}

/** Converts seconds to MM:SS string. */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function TimelineScrubber({ value, max, onChange, onScrubStart, onScrubEnd, markers = [], disabled }: TimelineScrubberProps) {
  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };

  return (
    <div className="flex w-full items-center gap-3">
      <span className="font-mono text-[11px] tabular-nums text-white/60 min-w-[2.5rem] text-right">
        {formatTime(value)}
      </span>
      <div className="relative flex-1">
        {max > 0 && markers.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-0 -translate-y-1/2">
            {markers.map((marker, i) => (
              <span
                key={`${marker.type}-${marker.time}-${i}`}
                className={`absolute top-1/2 h-2 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                  marker.type === 'Spawn' ? 'bg-emerald-400/80' : 'bg-red-400/80'
                }`}
                style={{ left: `${(marker.time / max) * 100}%` }}
              />
            ))}
          </div>
        )}
        <input
          type="range"
          min={0}
          max={max}
          step={0.01}
          value={value}
          onChange={onInput}
          onPointerDown={onScrubStart}
          onPointerUp={onScrubEnd}
          disabled={disabled}
          className="relative z-[1] h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-white/70 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
          aria-label="Timeline scrubber"
        />
      </div>
      <span className="font-mono text-[11px] tabular-nums text-white/40 min-w-[2.5rem]">
        {formatTime(max)}
      </span>
    </div>
  );
}
