import { useEffect } from 'react';

/** Sets the window title, `<page> · MoodyBlues`. */
export function useWindowTitle(title: string | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · MoodyBlues` : 'MoodyBlues';
  }, [title]);
}