import { formatBytes } from '../lib/format';
import { useStage } from './store';

/**
 * The Stage's progress marker (DESIGN.md 4.5): a rail with a playhead, because loading is the same
 * gesture as playback, only slower. Set it with `useStage.getState().setLoading(...)`.
 */
export function StagePreloader() {
  // The oldest download still running is the one shown.
  const loading = useStage((s) => Object.values(s.loading)[0] ?? null);
  if (!loading) return null;

  const fraction = loading.total ? Math.min(1, loading.received / loading.total) : null;
  const done = fraction === 1;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-20 flex justify-center px-6" role="status" aria-live="polite">
      <div className="glass elevated w-80 animate-rise space-y-2.5 rounded-[var(--radius-card)] border border-rule px-4 py-3">
        <p className="flex items-baseline justify-between gap-3 text-[12px] text-fg-2">
          <span>{done ? 'Preparing playback…' : loading.label}</span>
          {loading.received > 0 && !done && (
            <span className="tabular font-mono text-[11px] text-fg-3">
              {formatBytes(loading.received)}
              {loading.total ? ` / ${formatBytes(loading.total)}` : ''}
            </span>
          )}
        </p>
        <div className="relative h-1.5 rounded-full bg-ink-3">
          {fraction === null ? (
            <div className="shimmer absolute inset-0 rounded-full" />
          ) : (
            <>
              <div className="h-full rounded-full bg-gradient-to-r from-blue to-blue-bright transition-[width] duration-200" style={{ width: `${fraction * 100}%` }} />
              <span
                className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-now shadow-[0_0_8px_rgb(255_181_71/0.7)] transition-[left] duration-200"
                style={{ left: `${fraction * 100}%` }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
