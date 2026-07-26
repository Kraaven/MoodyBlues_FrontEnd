import type { ChangeEvent } from 'react';

interface TimelineScrubberProps {
  /** Current time in seconds. */
  value: number;
  /** Total duration in seconds. */
  max: number;
  onChange: (time: number) => void;
  disabled?: boolean;
}

/** Converts seconds to MM:SS string. */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function TimelineScrubber({ value, max, onChange, disabled }: TimelineScrubberProps) {
  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };

  return (
    <div className="flex w-full items-center gap-3">
      <span className="font-mono text-[11px] tabular-nums text-white/60 min-w-[2.5rem] text-right">
        {formatTime(value)}
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={0.01}
        value={value}
        onChange={onInput}
        disabled={disabled}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-white/70 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
        aria-label="Timeline scrubber"
      />
      <span className="font-mono text-[11px] tabular-nums text-white/40 min-w-[2.5rem]">
        {formatTime(max)}
      </span>
    </div>
  );
}
