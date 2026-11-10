import { useMediaQuery } from '../lib/useMediaQuery';
import type { SceneRef, StageView } from './store';
import { useStageView } from './useStageView';

/**
 * The backdrop of the list views (DESIGN.md 7.2): the Trace, dimmed so text over it stays readable.
 * Phones get a still gradient instead of a live canvas, to save the battery.
 */
const BROWSE: StageView = {
  id: 'browse',
  content: 'trace',
  pose: { position: [0, 9, 30], target: [0, -1, 0], fov: 50 },
  drift: true,
  dim: 0.35,
};
const BROWSE_STILL: StageView = { id: 'browse', content: 'none', dim: 0 };

/** Shows the dimmed Trace, or, with `preview`, a scene version the user lingered on. */
export function useBrowseStage(preview?: SceneRef | null): void {
  const phone = useMediaQuery('(max-width: 639px)');
  useStageView(
    phone
      ? BROWSE_STILL
      : preview
        ? { id: 'browse', content: 'scene', scene: preview, control: 'rig', drift: true, dim: 0.8, durationMs: 700 }
        : BROWSE,
  );
}
