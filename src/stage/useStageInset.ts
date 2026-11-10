import { useEffect } from 'react';
import type { RefObject } from 'react';
import { NO_INSET, useStage, type Inset } from './store';

/**
 * Keeps the 3D centred in the part of the window a view leaves free. `compute` gets the window size
 * and returns the pixels to leave out on each side; it is re-run when the window is resized.
 */
export function useStageInset(compute: (width: number, height: number) => Inset): void {
  useEffect(() => {
    const apply = () => useStage.getState().setInset(compute(window.innerWidth, window.innerHeight));
    apply();
    window.addEventListener('resize', apply);
    return () => {
      window.removeEventListener('resize', apply);
      useStage.getState().setInset(NO_INSET);
    };
    // `compute` is expected to be stable (defined outside the component or memoised).
  }, [compute]);
}

/**
 * Keeps the 3D centred in an element: the part of the window a tool view reserves for the viewport,
 * between its chrome, panels and timeline. Follows the element as it is resized.
 */
export function useStageRegion(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const apply = () => {
      const r = element.getBoundingClientRect();
      useStage.getState().setInset({
        left: Math.round(r.left),
        right: Math.round(window.innerWidth - r.right),
        top: Math.round(r.top),
        bottom: Math.round(window.innerHeight - r.bottom),
      });
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    window.addEventListener('resize', apply);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', apply);
      useStage.getState().setInset(NO_INSET);
    };
  }, [ref]);
}