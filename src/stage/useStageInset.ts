import { useEffect } from 'react';
import type { RefObject } from 'react';
import { NO_INSET, useStage, type Inset } from './store';

function insetOf(element: HTMLElement): Inset {
  const r = element.getBoundingClientRect();
  return {
    left: Math.round(r.left),
    right: Math.round(window.innerWidth - r.right),
    top: Math.round(r.top),
    bottom: Math.round(window.innerHeight - r.bottom),
  };
}

/**
 * Keeps the 3D centred in an element: the part of the window a view gives the Stage, between its
 * panels and timeline, or a card on a page. The camera glides there when the view appears, and
 * follows the element exactly while the page scrolls or the window is resized.
 */
export function useStageRegion(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => useStage.getState().setInset(insetOf(element), false));
    };
    useStage.getState().setInset(insetOf(element), true);
    const observer = new ResizeObserver(follow);
    observer.observe(element);
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow, { capture: true });
      useStage.getState().setInset(NO_INSET, true);
    };
  }, [ref, enabled]);
}
