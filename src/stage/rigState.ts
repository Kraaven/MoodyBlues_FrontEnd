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
