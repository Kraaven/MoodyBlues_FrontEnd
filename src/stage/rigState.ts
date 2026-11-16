let controlsHaveCamera = false;

/**
 * True while the orbit controls (not a transition) hold the camera. Anything that nudges the camera
 * or the orbit target from outside, like following a moving object, waits for this: during a move
 * the rig rewrites both every frame.
 */
export function orbitHasCamera(): boolean {
  return controlsHaveCamera;
}

export function setOrbitHasCamera(value: boolean): void {
  controlsHaveCamera = value;
}

let nearPlane: number | null = null;

/** A near plane some view insists on (first person sits inside a camera), or null for the rig's own. */
export function nearPlaneOverride(): number | null {
  return nearPlane;
}

export function setNearPlaneOverride(value: number | null): void {
  nearPlane = value;
}
