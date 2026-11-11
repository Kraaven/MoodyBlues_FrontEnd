import { formatBytes } from '../lib/format';
import { useStage } from './store';

/**
 * The Stage's progress marker: a rail with a playhead, because loading is the same gesture as
 * playback, only slower. Set it with `useStage.getState().setLoading(...)`.
 */
export function StagePreloader() {
  // The oldest download still running is the one shown.
  const loading = useStage((s) => Object.values(s.loading)[0] ?? null);
  if (!loading) return null;

  const fraction = loading.total ? Math.min(1, loading.received / loading.total) : null;
  const done = fraction === 1;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[96px] z-40 flex justify-center px-6" role="status" aria-live="polite">
      <div className="glass elevated w-[340px] animate-rise space-y-3 rounded-[10px] border border-rule-strong/60 px-5 py-4">
        <p className="flex items-baseline justify-between gap-3 text-[13px] text-fg-2">
          <span>{done ? 'Preparing…' : loading.label}</span>
          {loading.received > 0 && !done && (
            <span className="tabular font-mono text-[11px] text-fg-3">
              {formatBytes(loading.received)}
              {loading.total ? ` / ${formatBytes(loading.total)}` : ''}
            </span>
          )}
        </p>
        <div className="relative h-[3px] rounded-full bg-ink-4">
          {fraction === null ? (
            <div className="sweep absolute inset-0 rounded-full" />
          ) : (
            <>
              <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${fraction * 100}%` }} />
              <span
                className="absolute top-1/2 h-3 w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_10px_rgb(245_181_68/0.7)] transition-[left] duration-200"
                style={{ left: `${fraction * 100}%` }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
