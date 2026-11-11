import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsLeft, ChevronsRight, Pause, Play, Share, SquareTerminal } from 'lucide-react';
import { LogLevel, logColorHex, type Replay, type ReplayLog } from '../viewer/replay/replayFile';
import { nextLogTime, previousLogTime } from '../player/logNav';
import { SPEEDS, usePlaybackState, type Playback } from '../player/playback';
import { IconButton } from '../ui/Button';
import { Menu } from '../ui/Menu';
import { cn } from '../ui/cn';
import { formatPlayhead } from '../lib/format';

/** Markers closer than this many pixels are drawn as one cluster. */
const CLUSTER_PX = 4;
const ACTIVITY_BINS = 200;

const INFO_TICK = '#9fc7aa';

/**
 * The timeline: transport, time, speed, and the rail with every log marked by severity, gaps and
 * disconnects shaded, and spawn and delete activity above it. The playhead and the time readout are
 * written to the DOM by the playback clock, never through React, so playing costs no re-renders.
 */
export function Timeline({
  playback,
  replay,
  disabled,
  logsOpen,
  onToggleLogs,
  onShare,
}: {
  playback: Playback;
  replay: Replay | null;
  disabled?: boolean;
  logsOpen: boolean;
  onToggleLogs: () => void;
  onShare: () => void;
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
        <button
          type="button"
          onClick={onToggleLogs}
          aria-pressed={logsOpen}
          className={cn(
            'inline-flex h-10 min-w-[44px] items-center gap-2.5 rounded-[8px] px-3 text-[15px] transition-colors sm:min-w-[120px] sm:px-4',
            logsOpen ? 'bg-accent/16 text-accent' : 'bg-ink-4/70 text-fg hover:bg-ink-4',
          )}
        >
          <SquareTerminal className="h-[18px] w-[18px]" strokeWidth={1.6} />
          <span className="hidden sm:inline">Logs</span>
        </button>
        <button type="button" onClick={onShare} disabled={disabled} className="inline-flex h-10 items-center gap-2.5 rounded-[8px] px-3 text-[15px] text-fg transition-colors hover:bg-ink-4 disabled:opacity-40">
          <Share className="h-[18px] w-[18px]" strokeWidth={1.6} />
          <span className="hidden sm:inline">Share</span>
        </button>
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

  const clusters = useMemo(() => (replay ? clusterLogs(replay.logs, total, width) : []), [replay, total, width]);
  const marks = useMemo(() => (replay ? sessionMarkers(replay, total) : { gaps: [], offline: [] }), [replay, total]);
  const activity = useMemo(() => (replay ? activityBins(replay, total) : null), [replay, total]);

  return (
    <div className="relative mt-2">
      {/* When spawns and deletes happened. */}
      <div className="flex h-2.5 items-end gap-px px-0.5" aria-hidden="true">
        {activity?.bins.map((n, i) => (
          <div key={i} className="flex-1 rounded-t-[1px] bg-fg-3/35" style={{ height: n === 0 ? 0 : `${Math.max(20, (n / activity.max) * 100)}%` }} />
        ))}
      </div>
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
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
        className={cn('group relative h-7 touch-none select-none', disabled ? 'cursor-default opacity-50' : 'cursor-pointer')}
      >
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-fg-3/30">
          {marks.offline.map((span, i) => (
            <div
              key={i}
              title="Disconnected"
              className="absolute -inset-y-[3px] bg-[repeating-linear-gradient(135deg,rgb(184_161_255/0.5)_0_2px,transparent_2px_5px)]"
              style={{ left: `${span.from * 100}%`, width: `${Math.max(0.3, (span.to - span.from) * 100)}%` }}
            />
          ))}
          <div ref={playedRef} className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: 0 }} />
        </div>

        {clusters.map((c) => (
          <Marker key={c.key} cluster={c} />
        ))}

        {marks.gaps.map((x, i) => (
          <div key={`gap-${i}`} title="Data gap" className="absolute bottom-0 h-2 w-[2px] -translate-x-1/2 bg-wait" style={{ left: `${x * 100}%` }} />
        ))}

        <div ref={headRef} className="pointer-events-none absolute inset-y-0 w-0" style={{ left: 0 }}>
          <div className="absolute left-0 top-1/2 h-[18px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_14px_rgb(245_181_68/0.75)] transition-transform group-hover:scale-110" />
        </div>

        {hover && !disabled && (
          <div className="elevated pointer-events-none absolute -top-8 -translate-x-1/2 rounded-[5px] border border-rule-strong bg-ink-3 px-1.5 py-0.5 font-mono text-[11px] text-fg" style={{ left: hover.x }}>
            {formatPlayhead(hover.time)}
          </div>
        )}
      </div>
    </div>
  );
}

interface Cluster {
  key: string;
  fraction: number;
  count: number;
  level: LogLevel;
  color: string;
}

function tickColor(log: ReplayLog): string {
  if (log.level === LogLevel.Error) return '#ff6d5e';
  if (log.level === LogLevel.Warning) return '#f5b544';
  return log.color > 1 ? logColorHex(log.color) : INFO_TICK;
}

/** Groups log markers that would be closer than CLUSTER_PX apart; the most severe sets the look. */
function clusterLogs(logs: ReplayLog[], total: number, width: number): Cluster[] {
  if (total <= 0 || width <= 0) return [];
  const out: Cluster[] = [];
  let current: Cluster | null = null;
  let lastPx = -Infinity;
  for (const log of logs) {
    const fraction = Math.min(1, log.time / total);
    const px = fraction * width;
    if (current && px - lastPx < CLUSTER_PX) {
      current.count++;
      if (log.level > current.level) {
        current.level = log.level;
        current.color = tickColor(log);
      }
      continue;
    }
    current = { key: `${log.time}-${out.length}`, fraction, count: 1, level: log.level, color: tickColor(log) };
    out.push(current);
    lastPx = px;
  }
  return out;
}

function Marker({ cluster }: { cluster: Cluster }) {
  const severe = cluster.level !== LogLevel.Info;
  return (
    <span
      title={cluster.count > 1 ? `${cluster.count} logs` : undefined}
      className={cn('pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[2px]', severe ? 'h-3 w-[5px]' : 'h-2.5 w-[4px]')}
      style={{ left: `${cluster.fraction * 100}%`, backgroundColor: cluster.color, boxShadow: cluster.level === LogLevel.Error ? '0 0 8px rgb(255 109 94 / 0.6)' : undefined }}
    />
  );
}

/** Disconnected spans and data gaps, as fractions of the session. */
function sessionMarkers(replay: Replay, total: number): { gaps: number[]; offline: { from: number; to: number }[] } {
  if (total <= 0) return { gaps: [], offline: [] };
  const gaps: number[] = [];
  const offline: { from: number; to: number }[] = [];
  let down: number | null = null;
  for (const e of replay.events) {
    if (e.type === 'DataGap') gaps.push(Math.min(1, e.time / total));
    else if (e.type === 'Disconnected' && e.time < total - 0.05) down = e.time;
    else if (e.type === 'Connected' && down !== null) {
      offline.push({ from: down / total, to: Math.min(1, e.time / total) });
      down = null;
    }
  }
  return { gaps, offline };
}

function activityBins(replay: Replay, total: number): { bins: number[]; max: number } | null {
  if (total <= 0) return null;
  const bins = new Array<number>(ACTIVITY_BINS).fill(0);
  let any = false;
  for (const e of replay.events) {
    if (e.type !== 'Spawn' && e.type !== 'Delete') continue;
    bins[Math.min(ACTIVITY_BINS - 1, Math.floor((e.time / total) * ACTIVITY_BINS))]++;
    any = true;
  }
  return any ? { bins, max: Math.max(...bins) } : null;
}
