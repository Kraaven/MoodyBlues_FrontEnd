import { useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { releaseStageView, useStage, type StageView } from './store';
import { reducedMotion } from './support';

/**
 * Development only (`/_stage`): drives the Stage by hand so its camera, transitions, loading marker
 * and failure paths can be checked without a backend. Not linked from anywhere.
 */

const VIEWS: Record<string, StageView> = {
  overview: { id: 'lab', content: 'trace', pose: { position: [0, 9, 30], target: [0, -1, 0], fov: 50 }, drift: true, dim: 1 },
  closeup: { id: 'lab', content: 'trace', pose: { position: [6, 1.5, 11], target: [1, -2, 0], fov: 42 }, drift: true, dim: 1 },
  top: { id: 'lab', content: 'trace', pose: { position: [0, 38, 1], target: [0, -3, 0], fov: 55 }, drift: false, dim: 1 },
  dimmed: { id: 'lab', content: 'trace', pose: { position: [0, 9, 30], target: [0, -1, 0], fov: 50 }, drift: true, dim: 0.35 },
};

// A lost context returns null for getExtension, so the handle is kept from before it is lost.
let loseHandle: WEBGL_lose_context | null = null;

function loseContext(restore: boolean) {
  if (restore) {
    loseHandle?.restoreContext();
    return;
  }
  const canvas = document.querySelector('canvas');
  const context = (canvas?.getContext('webgl2') ?? canvas?.getContext('webgl')) as WebGL2RenderingContext | WebGLRenderingContext | null | undefined;
  loseHandle = context?.getExtension('WEBGL_lose_context') ?? null;
  loseHandle?.loseContext();
}

export default function StageLab() {
  const stats = useStage((s) => s.stats);
  const status = useStage((s) => s.status);
  const view = useStage((s) => s.view);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    document.title = 'Stage lab · MoodyBlues';
    const state = useStage.getState();
    state.setStatsEnabled(true);
    state.setView(VIEWS.overview);
    return () => {
      state.setStatsEnabled(false);
      state.setLoading('lab', null);
      releaseStageView('lab');
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  const go = (name: keyof typeof VIEWS) => useStage.getState().setView(VIEWS[name]);

  const simulateLoading = () => {
    if (timer.current) window.clearInterval(timer.current);
    const total = 18_400_000;
    let received = 0;
    timer.current = window.setInterval(() => {
      received = Math.min(total, received + total / 40);
      useStage.getState().setLoading('lab', { label: 'Downloading the scene', received, total });
      if (received >= total) {
        window.clearInterval(timer.current!);
        window.setTimeout(() => useStage.getState().setLoading('lab', null), 1200);
      }
    }, 100);
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      <div className="pointer-events-auto absolute left-4 top-4 w-[340px] space-y-4 rounded-[var(--radius-card)] border border-rule p-4 glass elevated">
        <div>
          <h1 className="font-display text-[26px] leading-8">Stage lab</h1>
          <p className="text-[12px] text-fg-3">
            Development only. view <span className="font-mono text-fg-2">{view.id}</span> · status <span className="font-mono text-fg-2">{status}</span> · motion{' '}
            <span className="font-mono text-fg-2">{reducedMotion() ? 'reduced' : 'full'}</span>
          </p>
        </div>

        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">Camera</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => go('overview')}>Overview</Button>
            <Button size="sm" variant="secondary" onClick={() => go('closeup')}>Close-up</Button>
            <Button size="sm" variant="secondary" onClick={() => go('top')}>Top-down</Button>
            <Button size="sm" variant="secondary" onClick={() => go('dimmed')}>Dimmed 35%</Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                go('closeup');
                window.setTimeout(() => go('top'), 300);
              }}
            >
              Interrupt
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">Content, loading, failure</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => useStage.getState().setView({ ...view, content: view.content === 'trace' ? 'none' : 'trace' })}>
              Toggle Trace
            </Button>
            <Button size="sm" variant="secondary" onClick={simulateLoading}>Simulate loading</Button>
            <Button size="sm" variant="secondary" onClick={() => loseContext(false)}>Lose context</Button>
            <Button size="sm" variant="secondary" onClick={() => loseContext(true)}>Restore</Button>
          </div>
        </section>

        <section className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">Frame cost</p>
          {stats ? (
            <dl className="tabular grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 font-mono text-[12px]">
              <dt className="text-fg-3">frames per second</dt><dd>{stats.fps.toFixed(1)}</dd>
              <dt className="text-fg-3">frame, average</dt><dd>{stats.avgMs.toFixed(1)} ms</dd>
              <dt className="text-fg-3">frame, worst</dt><dd>{stats.maxMs.toFixed(1)} ms</dd>
              <dt className="text-fg-3">draw calls</dt><dd>{stats.calls}</dd>
              <dt className="text-fg-3">lines / points</dt><dd>{stats.lines.toLocaleString()} / {stats.points}</dd>
              <dt className="text-fg-3">Trace drawn</dt><dd>{Math.round(stats.quality * 100)}%</dd>
            </dl>
          ) : (
            <p className="text-[12px] text-fg-3">Waiting for frames…</p>
          )}
          <p className="text-[11px] leading-4 text-fg-3">
            These are CPU-side frame times as the browser reports them. They include GPU time only as far as the browser waits for it,
            and are not a GPU measurement.
          </p>
        </section>
      </div>
    </div>
  );
}
