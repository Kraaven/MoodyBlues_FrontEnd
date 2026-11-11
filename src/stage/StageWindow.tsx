import { useRef } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../ui/cn';
import { StageSurface } from './StageSurface';
import { useStage } from './store';
import { useStageRegion } from './useStageInset';

/**
 * A window onto the persistent Stage, cut into a page.
 *
 * Pages do not paint their own background. This element paints the page colour everywhere except
 * inside itself (a box-shadow with an enormous spread), so the one WebGL canvas fixed behind the app
 * shows through exactly here, and the camera centres the scene in it. Opening the scene full screen
 * makes the hole the whole window and the camera glides out to match: the same scene, never reloaded.
 *
 * Rules for using it: no ancestor may be a stacking context below the page column (a transform,
 * including a transform animation such as `animate-rise`, or opacity below 1 while animating), or the
 * surround paints over the page content before it. No ancestor may clip it (`overflow: hidden` would cut the shadow off and let
 * the 3D show through the whole page), and the page's main column must be a stacking context
 * (`isolate`) that the bars and sidebar sit above. Rounded corners go in `className`; children are
 * laid out by `contentClassName` and clipped to the window.
 */
export function StageWindow({
  className,
  contentClassName,
  interactive = true,
  children,
}: {
  className?: string;
  contentClassName?: string;
  /** Orbit by dragging inside the window. */
  interactive?: boolean;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const status = useStage((s) => s.status);
  useStageRegion(ref);

  return (
    <div className={cn('relative', className)}>
      <div
        ref={ref}
        aria-hidden="true"
        className={cn('pointer-events-none absolute inset-0 -z-[1] rounded-[inherit]', status !== 'ok' && 'stage-fallback')}
        style={{ boxShadow: '0 0 0 200vmax var(--color-ink-2)' }}
      />
      <div className={cn('absolute inset-0 overflow-hidden rounded-[inherit]', contentClassName)}>
        {interactive && status === 'ok' && <StageSurface className="absolute inset-0" />}
        {children}
      </div>
    </div>
  );
}
