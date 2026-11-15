/** Capability and preference checks for the Stage (DESIGN.md 4.2, 6.5). */

let webgl: boolean | null = null;

/** True when the browser can create a WebGL context. `?stage=off` forces false, to test the fallback. */
export function webglSupported(): boolean {
  if (new URLSearchParams(window.location.search).get('stage') === 'off') return false;
  if (webgl !== null) return webgl;
  try {
    const canvas = document.createElement('canvas');
    webgl = Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    webgl = false;
  }
  return webgl;
}

const reducedQuery = typeof window !== 'undefined' && 'matchMedia' in window ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/** True when the user asked for less motion. `?motion=reduce` forces it, for testing. */
export function reducedMotion(): boolean {
  if (new URLSearchParams(window.location.search).get('motion') === 'reduce') return true;
  return reducedQuery?.matches ?? false;
}
