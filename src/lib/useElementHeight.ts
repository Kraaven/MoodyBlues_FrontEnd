import { useLayoutEffect, useState, type RefObject } from 'react';

/** The height of an element, kept current as it changes; 0 while it is not there. For chrome that others must leave room for. */
export function useElementHeight(ref: RefObject<HTMLElement | null>, active = true): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !active) {
      setHeight(0);
      return;
    }
    setHeight(Math.round(element.getBoundingClientRect().height));
    const observer = new ResizeObserver(([entry]) => setHeight(Math.round(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, active]);
  return height;
}
