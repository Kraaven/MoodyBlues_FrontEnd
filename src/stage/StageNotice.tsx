import { Box } from 'lucide-react';
import { useStage } from './store';

/**
 * For the 3D studio: when the browser cannot draw 3D, or has lost its graphics context, say so in the
 * view. The windows, lists and the timeline still work, as far as they can without the scene.
 */
export function StageNotice() {
  const status = useStage((s) => s.status);
  if (status === 'ok') return null;
  const unsupported = status === 'unsupported';
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center p-6">
      <div role="status" className="glass elevated max-w-sm rounded-[14px] border border-rule-strong/60 p-7 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ink-4">
          <Box className="h-5 w-5 text-fg-3" />
        </div>
        <p className="display text-[20px] text-fg">{unsupported ? 'The 3D view is not available' : 'The 3D view is restoring'}</p>
        <p className="mt-2 text-[14px] leading-6 text-fg-2">
          {unsupported
            ? 'This browser cannot create a WebGL context, so the scene cannot be drawn. Turn on hardware acceleration or try another browser. The windows and lists still work.'
            : 'The graphics context was lost. It comes back by itself in a moment.'}
        </p>
      </div>
    </div>
  );
}
