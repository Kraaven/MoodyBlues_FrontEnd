import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bug, ChevronDown, ChevronUp, X } from 'lucide-react';
import { prefetcher } from '../prefetch/prefetcher';
import { sceneCache, type CacheInfo } from '../prefetch/sceneCache';
import { useReplayBinding } from '../studio/binding';
import { sceneCacheInfo } from '../stage/sceneAssets';
import { useStage } from '../stage/store';
import { IconButton } from '../ui/Button';
import { cn } from '../ui/cn';

const TOGGLES = [
  ['wireframe', 'Wireframe'],
  ['bounds', 'Bounds'],
  ['showHidden', 'Show inactive'],
  ['fog', 'Fog'],
] as const;

const POSITION_KEY = 'moodyblues.debug.position';
const MARGIN = 8;

interface Point {
  x: number;
  y: number;
}

function readPosition(): Point | null {
  try {
    const p = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null') as Partial<Point> | null;
    return p && typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : null;
  } catch {
    return null;
  }
}

function storePosition(p: Point): void {
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(p));
  } catch {
    // Not remembered; it still moves.
  }
}

/** Where it first appears: directly under the scene-name card at the top left of the studio. */
function defaultPosition(): Point {
  return window.innerWidth < 640 ? { x: 16, y: 80 } : { x: 24, y: 88 };
}

function clamp(p: Point, size: { w: number; h: number }): Point {
  return {
    x: Math.min(Math.max(MARGIN, p.x), Math.max(MARGIN, window.innerWidth - size.w - MARGIN)),
    y: Math.min(Math.max(MARGIN, p.y), Math.max(MARGIN, window.innerHeight - size.h - MARGIN)),
  };
}

/**
 * Developer tools for the Stage, as a translucent window over the studio: frame times, what the
 * renderer holds, the replay clock, the scene cache and the query cache, plus view toggles. It is
 * opened from the rail, moves by its header and is remembered. Statistics are collected only while
 * it is mounted.
 */
export default function DebugWindow() {
  const [folded, setFolded] = useState(false);
  const [, tick] = useState(0);
  const [disk, setDisk] = useState<CacheInfo | null>(null);
  const [position, setPosition] = useState<Point>(() => readPosition() ?? defaultPosition());
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; start: Point } | null>(null);
  const queries = useQueryClient();
  const stats = useStage((s) => s.stats);
  const debug = useStage((s) => s.debug);
  const view = useStage((s) => s.view);
  const status = useStage((s) => s.status);

  const size = () => ({ w: ref.current?.offsetWidth ?? 300, h: ref.current?.offsetHeight ?? 40 });

  // Keep it on screen: when it first shows, when it folds or grows, and when the viewport shrinks.
  useLayoutEffect(() => {
    const fit = () => setPosition((p) => clamp(p, size()));
    fit();
    window.addEventListener('resize', fit);
    const observer = new ResizeObserver(fit);
    if (ref.current) observer.observe(ref.current);
    return () => {
      window.removeEventListener('resize', fit);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    useStage.getState().setStatsEnabled(true);
    const timer = window.setInterval(() => tick((n) => n + 1), 500);
    return () => {
      window.clearInterval(timer);
      useStage.getState().setStatsEnabled(false);
    };
  }, []);

  useEffect(() => {
    const read = () => void sceneCache.info().then(setDisk);
    read();
    const timer = window.setInterval(read, 2_000);
    return () => window.clearInterval(timer);
  }, []);

  const begin = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: position };
  };
  const track = (e: React.PointerEvent) => {
    const g = drag.current;
    if (g) setPosition(clamp({ x: g.start.x + e.clientX - g.x, y: g.start.y + e.clientY - g.y }, size()));
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    storePosition(position);
  };

  const playback = useReplayBinding.getState().playback;
  const cache = sceneCacheInfo();
  const rows: [string, string][] = [
    ['View', `${view.id} · ${view.content}`],
    ['Context', status],
    ['Frame', stats ? `${stats.avgMs.toFixed(1)} ms avg · ${stats.maxMs.toFixed(1)} ms max · ${stats.fps.toFixed(0)} fps` : '—'],
    ['Draw calls', stats ? `${stats.calls} · ${stats.triangles} triangles` : '—'],
    ['GPU holds', stats ? `${stats.geometries} geometries · ${stats.textures} textures` : '—'],
    ['Replay clock', playback ? `${playback.time.toFixed(2)} s${playback.playing ? ' · playing' : ''}` : '—'],
    ['Scene cache', cache.length ? cache.map((c) => `${c.key.slice(-8)}×${c.refs}${c.loaded ? '' : '…'}`).join(' ') : 'empty'],
    ['Disk cache', disk ? `${disk.count} scenes · ${(disk.bytes / 1048576).toFixed(0)} / ${(disk.budget / 1048576).toFixed(0)} MB` : '—'],
    ['Prefetch', `${prefetcher.status().pending} queued${prefetcher.status().downloading ? ' · downloading' : ''}`],
    ['Query cache', `${queries.getQueryCache().getAll().length} queries`],
  ];

  return (
    <aside
      ref={ref}
      aria-label="Debug"
      className="elevated pointer-events-auto fixed z-30 w-[300px] max-w-[calc(100vw-1rem)] animate-[window-in_220ms_var(--ease-out-soft)] overflow-hidden rounded-[var(--radius-card)] border border-rule-strong/60 bg-ink-2/60 text-[12px] backdrop-blur-md"
      style={{ left: position.x, top: position.y }}
    >
      <header
        onPointerDown={begin}
        onPointerMove={track}
        onPointerUp={end}
        onPointerCancel={end}
        className="flex h-10 cursor-grab touch-none select-none items-center gap-1 pl-3 pr-1 text-fg-2 active:cursor-grabbing"
      >
        <Bug aria-hidden="true" className="h-3.5 w-3.5" />
        <span className="flex-1 pl-1 font-medium text-fg">Debug</span>
        <IconButton label={folded ? 'Expand' : 'Collapse'} size="xs" aria-expanded={!folded} onClick={() => setFolded(!folded)}>
          {folded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </IconButton>
        <IconButton label="Close" size="xs" onClick={() => useStage.getState().setDebugOpen(false)}>
          <X className="h-3.5 w-3.5" />
        </IconButton>
      </header>
      {!folded && (
        <div className="space-y-3 border-t border-rule/70 p-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-fg-3">{k}</dt>
                <dd className="tabular truncate text-right font-mono text-fg">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-1.5">
            {TOGGLES.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={debug[key]}
                onClick={() => useStage.getState().setDebug({ [key]: !debug[key] })}
                className={cn('rounded-[5px] border px-2 py-1 text-[11px]', debug[key] ? 'border-accent/50 bg-accent/12 text-accent' : 'border-rule-strong text-fg-2 hover:text-fg')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
