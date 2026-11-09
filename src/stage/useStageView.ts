import { useEffect } from 'react';
import { releaseStageView, useStage, type StageView } from './store';

/**
 * Tells the Stage what this view needs while it is mounted. Pass a constant object (or one that
 * only changes when the view really changes); it is compared by value.
 */
export function useStageView(view: StageView): void {
  const key = JSON.stringify(view);
  useEffect(() => {
    useStage.getState().setView(JSON.parse(key) as StageView);
    return () => releaseStageView(view.id);
    // `key` is the value comparison of `view`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
