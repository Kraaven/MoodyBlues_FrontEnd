import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';

/**
 * The canvas draws on demand, so anything that changes the picture without going through React props
 * (a node moved, a material flag flipped, a light toggled) has to ask for the next frame.
 */
export function useRedraw(): { redraw: () => void; shadowsChanged: () => void } {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  return useMemo(
    () => ({
      redraw: () => invalidate(),
      /** Shadow maps are not redrawn every frame; call this when something that casts a shadow changed. */
      shadowsChanged: () => {
        gl.shadowMap.needsUpdate = true;
        invalidate();
      },
    }),
    [gl, invalidate],
  );
}
