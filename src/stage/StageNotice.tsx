import { Box } from 'lucide-react';
import { useStage } from './store';

/**
 * For the tool views (the player and the inspector): when the browser cannot draw 3D, or has lost its
 * graphics context, say so in the viewport. The lists and panels still work, as far as they can
 * without the scene.
 */
export function StageNotice() {
  const status = useStage((s) => s.status);
  if (status === 'ok') return null;
  const unsupported = status === 'unsupported';
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
      <div role="status" className="glass elevated max-w-sm rounded-[var(--radius-dialog)] border border-rule p-5 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-rule bg-ink-2">
          <Box className="h-5 w-5 text-fg-3" />
        </div>
        <p className="text-[15px] font-semibold text-fg">{unsupported ? 'The 3D view is not available' : 'The 3D view is restoring'}</p>
        <p className="mt-1.5 text-sm text-fg-2">
          {unsupported
            ? 'This browser cannot create a WebGL context, so the scene cannot be drawn. Turn on hardware acceleration or try another browser.'
            : 'The graphics context was lost. It comes back by itself in a moment.'}
        </p>
      </div>
    </div>
  );
}
