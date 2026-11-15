import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsLeft, ChevronsRight, Pause, Play } from 'lucide-react';
import { LogLevel, logColorHex, type Replay, type ReplayLog } from '../viewer/replay/replayFile';
import { binLogs, type LogBin } from './logMarkers';
import { nextLogTime, previousLogTime } from './logNav';
import { SPEEDS, usePlaybackState, type Playback } from './playback';
import { IconButton } from '../ui/Button';
import { Menu } from '../ui/Menu';
import { cn } from '../ui/cn';
import { formatPlayhead } from '../lib/format';

/** Logs that land within this many pixels of each other share one marker. */
const BIN_PX = 5;

const LEVEL_NAME: Record<number, string> = { [LogLevel.Info]: 'Info', [LogLevel.Warning]: 'Warning', [LogLevel.Error]: 'Error' };

/**
 * The timeline: transport, time, speed, and the rail with every log marked in its own colour. The playhead and the time readout are
 * written to the DOM by the playback clock, never through React, so playing costs no re-renders.
 */
export function Timeline({
  playback,
  replay,
  disabled,
}: {
  playback: Playback;
  replay: Replay | null;
  disabled?: boolean;
}) {
  const { playing, speed, duration } = usePlaybackState(playback);
  const total = replay?.durationSeconds ?? duration;
  const logs = replay?.logs ?? [];
  const on = playing && !disabled;

  return (
    <div className="glass elevated rounded-[12px] border border-rule-strong/60 px-4 pb-4 pt-3 sm:px-5">
      <div className="flex h-11 items-center gap-2 sm:gap-4">
        <button
          type="button"
          aria-label={on ? 'Pause (Space)' : 'Play (Space)'}
          title={on ? 'Pause (Space)' : 'Play (Space)'}
          onClick={() => playback.toggle()}
          disabled={disabled}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-accent/16 text-accent transition-colors hover:bg-accent/25 disabled:opacity-40"
        >
          {on ? <Pause className="h-[18px] w-[18px] fill-current" strokeWidth={0} /> : <Play className="h-[18px] w-[18px] fill-current" strokeWidth={0} />}
        </button>
        <TimeReadout playback={playback} total={total} />
        <Menu
          align="start"
          trigger={
            <button type="button" disabled={disabled} aria-label={`Speed ${speed}×`} className="tabular h-9 rounded-[6px] px-2.5 font-mono text-[14px] text-fg transition-colors hover:bg-ink-4 disabled:opacity-40">
              {speed}×
            </button>
          }
          items={SPEEDS.map((s, i) => ({ label: `${s}×`, hint: String(i + 1), onSelect: () => playback.setSpeed(s) }))}
        />
        <div className="hidden items-center sm:flex">
          <IconButton label="Previous log" shortcut="[" size="sm" disabled={disabled || logs.length === 0} onClick={() => playback.seek(previousLogTime(logs, playback.time))}>
            <ChevronsLeft className="h-4 w-4" />
          </IconButton>
          <IconButton label="Next log" shortcut="]" size="sm" disabled={disabled || logs.length === 0} onClick={() => playback.seek(nextLogTime(logs, playback.time))}>
            <ChevronsRight className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex-1" />
      </div>
      <Rail playback={playback} replay={replay} total={total} disabled={disabled} />
    </div>
  );
}

function TimeReadout({ playback, total }: { playback: Playback; total: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      playback.subscribe((t) => {
        if (ref.current) ref.current.textContent = formatPlayhead(t, 3);
      }),
    [playback],
  );
  return (
    <span className="tabular flex items-baseline gap-3 whitespace-nowrap font-mono sm:gap-5">
      <span ref={ref} className="text-[18px] text-accent sm:text-[19px]">
        {formatPlayhead(playback.time, 3)}
      </span>
      <span className="hidden text-[13px] text-fg-3 sm:inline">/ {formatPlayhead(total, 3)}</span>
    </span>
  );
}

function Rail({ playback, replay, total, disabled }: { playback: Playback; replay: Replay | null; total: number; disabled?: boolean }) {
  const railRef = useRef<HTMLDivElement>(null);
  const playedRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<{ x: number; time: number } | null>(null);
  const [hoverBin, setHoverBin] = useState<LogBin | null>(null);
  const scrubbing = useRef<{ wasPlaying: boolean } | null>(null);

  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () =>
      playback.subscribe((t) => {
        const fraction = total > 0 ? Math.min(1, t / total) : 0;
        if (playedRef.current) playedRef.current.style.width = `${fraction * 100}%`;
        if (headRef.current) headRef.current.style.left = `${fraction * 100}%`;
        railRef.current?.setAttribute('aria-valuenow', t.toFixed(2));
        railRef.current?.setAttribute('aria-valuetext', formatPlayhead(t));
      }),
    [playback, total],
  );

  const timeAt = (clientX: number) => {
    const rect = railRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * total;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || total <= 0) return;
    railRef.current?.setPointerCapture(e.pointerId);
    scrubbing.current = { wasPlaying: playback.playing };
    playback.setPlaying(false);
    playback.seek(timeAt(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (total <= 0) return;
    const rect = railRef.current!.getBoundingClientRect();
    setHover({ x: e.clientX - rect.left, time: timeAt(e.clientX) });
    if (scrubbing.current) playback.seek(timeAt(e.clientX));
  };
  const endScrub = () => {
    if (scrubbing.current?.wasPlaying) playback.setPlaying(true);
    scrubbing.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowLeft') playback.seek(playback.time - step);
    else if (e.key === 'ArrowRight') playback.seek(playback.time + step);
    else if (e.key === 'Home') playback.seek(0);
    else if (e.key === 'End') playback.seek(total);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const logs = replay?.logs;
  const bins = useMemo(() => (logs ? binLogs(logs, total, width, BIN_PX) : []), [logs, total, width]);

  return (
    <div className="relative mt-2">
      <div
        ref={railRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Timeline"
        aria-valuemin={0}
        aria-valuemax={Number(total.toFixed(2))}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endScrub}
        onPointerCancel={endScrub}
        onLostPointerCapture={endScrub}
        onPointerLeave={() => {
          setHover(null);
          setHoverBin(null);
        }}
        onKeyDown={onKeyDown}
        className={cn('group relative h-7 touch-none select-none', disabled ? 'cursor-default opacity-50' : 'cursor-pointer')}
      >
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-fg-3/30">
          <div ref={playedRef} className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: 0 }} />
        </div>

        {logs &&
          bins.map((bin) => (
            <Marker
              key={bin.key}
              bin={bin}
              log={logs[bin.worst]}
              onHover={setHoverBin}
              onSeek={(t) => {
                if (!disabled) playback.seek(t);
              }}
            />
          ))}

        <div ref={headRef} className="pointer-events-none absolute inset-y-0 w-0" style={{ left: 0 }}>
          <div className="absolute left-0 top-1/2 h-[18px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_14px_rgb(245_181_68/0.75)] transition-transform group-hover:scale-110" />
        </div>

        {hoverBin && logs && !disabled && <MarkerTip bin={hoverBin} logs={logs} />}

        {hover && !hoverBin && !disabled && (
          <div className="elevated pointer-events-none absolute -top-8 -translate-x-1/2 rounded-[5px] border border-rule-strong bg-ink-3 px-1.5 py-0.5 font-mono text-[11px] text-fg" style={{ left: hover.x }}>
            {formatPlayhead(hover.time)}
          </div>
        )}
      </div>
    </div>
  );
}

function Marker({ bin, log, onHover, onSeek }: { bin: LogBin; log: ReplayLog; onHover: (bin: LogBin | null) => void; onSeek: (time: number) => void }) {
  const severe = log.level !== LogLevel.Info;
  const color = logColorHex(log.color);
  return (
    // A wide invisible hit area around the visible tick; stops the rail from starting a scrub.
    <span
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={() => onHover(bin)}
      onPointerLeave={() => onHover(null)}
      onClick={() => onSeek(log.time)}
      className="absolute inset-y-0 flex w-[9px] -translate-x-1/2 cursor-pointer items-center justify-center"
      style={{ left: `${bin.fraction * 100}%` }}
    >
      <span
        className={cn('rounded-[2px]', severe ? 'h-3 w-[5px]' : 'h-2.5 w-[4px]')}
        style={{ backgroundColor: color, boxShadow: log.level === LogLevel.Error ? `0 0 8px ${color}` : undefined }}
      />
    </span>
  );
}

function MarkerTip({ bin, logs }: { bin: LogBin; logs: ReplayLog[] }) {
  const log = logs[bin.worst];
  const first = (log.text || '(empty)').split('\n')[0];
  return (
    <div
      className="elevated pointer-events-none absolute bottom-full z-10 mb-1 w-max max-w-[min(320px,80vw)] -translate-x-1/2 rounded-[6px] border border-rule-strong bg-ink-3 px-2 py-1.5 font-mono text-[11px] text-fg"
      style={{ left: `clamp(80px, ${bin.fraction * 100}%, calc(100% - 80px))` }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="uppercase tracking-[0.04em]" style={{ color: logColorHex(log.color) }}>
          {LEVEL_NAME[log.level] ?? 'Log'}
          {bin.count > 1 && ` + ${bin.count - 1} more`}
        </span>
        <span className="tabular text-fg-3">{formatPlayhead(log.time, 3)}</span>
      </div>
      <p className="mt-1 line-clamp-3 break-words text-fg-2">{first}</p>
    </div>
  );
}
