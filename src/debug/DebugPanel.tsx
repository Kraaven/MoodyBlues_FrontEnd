import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bug, ChevronDown, ChevronUp } from 'lucide-react';
import { useReplayBinding } from '../player/binding';
import { sceneCacheInfo } from '../stage/sceneAssets';
import { useStage } from '../stage/store';
import { cn } from '../ui/cn';

const TOGGLES = [
  ['wireframe', 'Wireframe'],
  ['axes', 'Axes'],
  ['bounds', 'Bounds'],
  ['showHidden', 'Show inactive'],
  ['fog', 'Fog'],
] as const;

/**
 * Developer tools for the Stage (DESIGN.md 9.6): frame times, what the renderer holds, the replay
 * clock, the scene cache and the query cache, plus view toggles. Only loaded with `?debug`.
 */
export default function DebugPanel() {
  const [open, setOpen] = useState(true);
  const [, tick] = useState(0);
  const queries = useQueryClient();
  const stats = useStage((s) => s.stats);
  const debug = useStage((s) => s.debug);
  const view = useStage((s) => s.view);
  const quality = useStage((s) => s.traceQuality);
  const status = useStage((s) => s.status);

  useEffect(() => {
    useStage.getState().setStatsEnabled(true);
    const timer = window.setInterval(() => tick((n) => n + 1), 500);
    return () => {
      window.clearInterval(timer);
      useStage.getState().setStatsEnabled(false);
    };
  }, []);

  const playback = useReplayBinding.getState().playback;
  const cache = sceneCacheInfo();
  const rows: [string, string][] = [
    ['View', `${view.id} · ${view.content}`],
    ['Context', status],
    ['Frame', stats ? `${stats.avgMs.toFixed(1)} ms avg · ${stats.maxMs.toFixed(1)} ms max · ${stats.fps.toFixed(0)} fps` : '—'],
    ['Draw calls', stats ? `${stats.calls} · ${stats.triangles} triangles` : '—'],
    ['GPU holds', stats ? `${stats.geometries} geometries · ${stats.textures} textures` : '—'],
    ['Trace quality', `${Math.round(quality * 100)}%`],
    ['Replay clock', playback ? `${playback.time.toFixed(2)} s${playback.playing ? ' · playing' : ''}` : '—'],
    ['Scene cache', cache.length ? cache.map((c) => `${c.key.slice(-8)}×${c.refs}${c.loaded ? '' : '…'}`).join(' ') : 'empty'],
    ['Query cache', `${queries.getQueryCache().getAll().length} queries`],
  ];

  return (
    <aside
      aria-label="Debug"
      className={cn('glass elevated fixed bottom-3 left-3 z-50 w-[300px] max-w-[calc(100vw-1.5rem)] rounded-[var(--radius-card)] border border-rule text-[12px]')}
    >
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-fg-2 hover:text-fg">
        <Bug className="h-3.5 w-3.5" />
        <span className="flex-1 font-medium">Debug</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-rule p-3">
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
                className={cn(
                  'rounded-[5px] border px-2 py-1 text-[11px]',
                  debug[key] ? 'border-now/60 bg-now/10 text-fg' : 'border-rule-strong text-fg-2 hover:text-fg',
                )}
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
