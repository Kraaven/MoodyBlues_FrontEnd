import { useEffect } from 'react';
import { prefetcher } from './prefetcher';

/** Tells the prefetcher which project the user is in, so its scenes download first. Null on the lobby. */
export function usePrefetchFocus(projectId: string | undefined): void {
  useEffect(() => {
    prefetcher.focus(projectId ?? null);
    return () => prefetcher.focus(null);
  }, [projectId]);
}
