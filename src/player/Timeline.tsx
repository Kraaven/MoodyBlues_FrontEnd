import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronsLeft, ChevronsRight, Pause, Play, ScrollText } from 'lucide-react';
import { LogLevel, logColorHex, type Replay, type ReplayLog } from '../viewer/replay/replayFile';
import { IconButton } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { cn } from '../ui/cn';
import { formatPlayhead } from '../lib/format';
import { SPEEDS, usePlaybackState, usePlayerUi, type Playback } from './playback';
import { nextLogTime, previousLogTime } from './logNav';

/** Markers closer than this many pixels are drawn as one cluster (DESIGN.md 7.6). */
const CLUSTER_PX = 3;
const ACTIVITY_BINS = 240;

export function Timeline({ playback, replay, disabled }: { playback: Playback; replay: Replay | null; disabled?: boolean }) {
  const { playing, speed, duration } = usePlaybackState(playback);
  const logsOnTrack = usePlayerUi((s) => s.logsOnTrack);
  const setLogsOnTrack = usePlayerUi((s) => s.setLogsOnTrack);
  const total = replay?.durationSeconds ?? duration;
  const logs = replay?.logs ?? [];

  return (
    <div className="shrink-0 border-t border-line bg-surface-1/95 px-4 pb-3 pt-2">
      <div className="flex h-9 items-center gap-2">
        <IconButton label={playing && !disabled ? 'Pause' : 'Play'} shortcut="Space" onClick={() => playback.toggle()} disabled={disabled}>
          {playing && !disabled ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
        </IconButton>
        <TimeReadout playback={playback} total={total} />
        <div className="mx-2 h-5 w-px bg-line" aria-hidden="true" />
        <div className="flex items-center gap-0.5" role="group" aria-label="Playback speed">
          {SPEEDS.map((s, i) => (
            <Tooltip key={s} content={`Speed ${s}× (${i + 1})`}>
              <button
                type="button"
                aria-pressed={s === speed}
                disabled={disabled}
                onClick={() => playback.setSpeed(s)}
                className={cn(
                  'tabular h-7 rounded-[5px] px-2 font-mono text-[12px] transition-colors duration-[120ms] disabled:opacity-40',
                  s === speed ? 'bg-accent/18 text-accent-bright' : 'text-fg-3 hover:text-fg',
                )}
              >
                {s}×
              </button>
            </Tooltip>
          ))}
        </div>
        <div className="mx-2 h-5 w-px bg-line" aria-hidden="true" />
        <IconButton label="Previous log" shortcut="[" size="sm" disabled={disabled || logs.length === 0} onClick={() => playback.seek(previousLogTime(logs, playback.time))}>
          <ChevronsLeft className="h-4 w-4" />
        </IconButton>
        <IconButton label="Next log" shortcut="]" size="sm" disabled={disabled || logs.length === 0} onClick={() => playback.seek(nextLogTime(logs, playback.time))}>
          <ChevronsRight className="h-4 w-4" />
        </IconButton>
        <div className="flex-1" />
        <IconButton label={logsOnTrack ? 'Hide logs on the timeline' : 'Show logs on the timeline'} size="sm" active={logsOnTrack} onClick={() => setLogsOnTrack(!logsOnTrack)}>
          <ScrollText className="h-4 w-4" />
        </IconButton>
      </div>
      <Rail playback={playback} replay={replay} total={total} disabled={disabled} showLogs={logsOnTrack} />
    </div>
  );
}

function TimeReadout({ playback, total }: { playback: Playback; total: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      playback.subscribe((t) => {
        if (ref.current) ref.current.textContent = formatPlayhead(t);
      }),
    [playback],
  );
  return (
    <span className="tabular font-mono text-[13px] text-fg">
      <span ref={ref}>{formatPlayhead(playback.time)}</span>
      <span className="text-fg-3"> / {formatPlayhead(total)}</span>
    </span>
  );
}

function Rail({ playback, replay, total, disabled, showLogs }: { playback: Playback; replay: Replay | null; total: number; disabled?: boolean; showLogs: boolean }) {
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

  const clusters = useMemo(() => (showLogs && replay ? clusterLogs(replay.logs, total, width) : []), [showLogs, replay, total, width]);
  const sessionMarks = useMemo(() => (replay ? sessionMarkers(replay, total) : { gaps: [], offline: [] }), [replay, total]);
  const activity = useMemo(() => (replay ? activityBins(replay, total) : null), [replay, total]);

  return (
    <div className="relative pt-1">
      {/* Activity: when spawns and deletes happened. */}
      <div className="flex h-3 items-end gap-px" aria-hidden="true">
        {activity?.bins.map((n, i) => (
          <div key={i} className="flex-1 rounded-t-[1px] bg-fg-3/45" style={{ height: n === 0 ? 0 : `${Math.max(15, (n / activity.max) * 100)}%` }} />
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
        className={cn('group relative mt-1 h-7 touch-none select-none', disabled ? 'cursor-default opacity-50' : 'cursor-pointer')}
      >
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-surface-3">
          {sessionMarks.offline.map((span, i) => (
            <div
              key={i}
              title="Disconnected"
              className="absolute inset-y-0 bg-[repeating-linear-gradient(135deg,rgb(245_181_68/0.35)_0_3px,transparent_3px_6px)]"
              style={{ left: `${span.from * 100}%`, width: `${Math.max(0.3, (span.to - span.from) * 100)}%` }}
            />
          ))}
          <div ref={playedRef} className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent to-accent-cyan" style={{ width: 0 }} />
        </div>

        {clusters.map((c) => (
          <Marker key={c.key} cluster={c} />
        ))}

        {sessionMarks.gaps.map((x, i) => (
          <div key={`gap-${i}`} title="Data gap" className="absolute bottom-0 h-2 w-0.5 -translate-x-1/2 bg-danger" style={{ left: `${x * 100}%` }} />
        ))}

        <div ref={headRef} className="pointer-events-none absolute inset-y-0 w-0" style={{ left: 0 }}>
          <div className="absolute inset-y-0 -left-px w-0.5 rounded-full bg-white shadow-[0_0_10px_2px_rgb(34_211_238/0.55)]" />
          <div className="absolute left-0 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow-[0_0_12px_rgb(91_124_250/0.8)] transition-transform group-hover:scale-110" />
        </div>

        {hover && !disabled && (
          <div
            className="elevated pointer-events-none absolute -top-8 -translate-x-1/2 rounded-[5px] border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg"
            style={{ left: hover.x }}
          >
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

/** Groups log markers that would be closer than CLUSTER_PX apart; the most severe log sets the look. */
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
        current.color = logColorHex(log.color);
      }
      continue;
    }
    current = { key: `${log.time}-${out.length}`, fraction, count: 1, level: log.level, color: logColorHex(log.color) };
    out.push(current);
    lastPx = px;
  }
  return out;
}

function Marker({ cluster }: { cluster: Cluster }) {
  const base = 'pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2';
  const style = { left: `${cluster.fraction * 100}%` };
  if (cluster.count > 1) {
    return (
      <span
        className={cn(base, 'flex h-3.5 min-w-3.5 items-center justify-center rounded-full border px-0.5 font-mono text-[9px] leading-none text-bg')}
        style={{ ...style, backgroundColor: cluster.color, borderColor: 'rgb(5 7 14 / 0.6)' }}
      >
        {cluster.count > 99 ? '99+' : cluster.count}
      </span>
    );
  }
  if (cluster.level === LogLevel.Error) {
    return (
      <svg className={cn(base, 'h-2.5 w-2.5')} style={style} viewBox="0 0 8 8" aria-hidden="true">
        <path d="M1 1L7 7M7 1L1 7" stroke={cluster.color} strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    );
  }
  if (cluster.level === LogLevel.Warning) {
    return <span className={cn(base, 'h-2 w-2 rounded-full')} style={{ ...style, backgroundColor: cluster.color }} />;
  }
  return <span className={cn(base, 'h-3 w-0.5 rounded-full opacity-85')} style={{ ...style, backgroundColor: cluster.color }} />;
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
