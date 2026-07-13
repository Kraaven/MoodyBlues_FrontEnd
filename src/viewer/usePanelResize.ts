import { useCallback, useRef, useState } from 'react';

const DOCK_WIDTH = 48;

export function usePanelResize(side: 'left' | 'right', min: number, max: number, initial: number) {
  const [width, setWidth] = useState(initial);
  const isResizing = useRef(false);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizing.current = true;

      const onMouseMove = (ev: MouseEvent) => {
        const newWidth =
          side === 'left'
            ? ev.clientX - DOCK_WIDTH
            : window.innerWidth - ev.clientX - DOCK_WIDTH;
        setWidth(Math.max(min, Math.min(max, newWidth)));
      };

      const onMouseUp = () => {
        isResizing.current = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [side, min, max],
  );

  return { width, onMouseDown };
}
