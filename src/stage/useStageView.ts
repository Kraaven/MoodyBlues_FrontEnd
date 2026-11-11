import { useEffect } from 'react';
import { releaseStageView, useStage, type StageView } from './store';

/**
 * Tells the Stage what this view needs while it is mounted. Pass a constant object (or one that
 * only changes when the view really changes); it is compared by value. `null` leaves the Stage to
 * another component of the same page.
 */
export function useStageView(view: StageView | null): void {
  const key = view ? JSON.stringify(view) : null;
  useEffect(() => {
    if (!key) return;
    const next = JSON.parse(key) as StageView;
    useStage.getState().setView(next);
    return () => releaseStageView(next.id);
  }, [key]);
}
