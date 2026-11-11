/**
 * The 3D side of the design tokens. three.js cannot read CSS variables, so the values the scene
 * needs are repeated here. `palette.test.ts` parses `tokens.css` and fails if they drift apart.
 */
export const PALETTE = {
  ink1: '#232322',
  ink2: '#2a2a29',
  world0: '#1c1e22',
  world1: '#24262b',
  world2: '#2c2f35',
  grid: '#353941',
  gridStrong: '#434852',
  accent: '#f5b544',
  fg: '#efece6',
  axisX: '#e98a73',
  axisY: '#95cda5',
  axisZ: '#8db3dd',
} as const;

/** Which CSS token each palette entry mirrors, for the drift test. */
export const PALETTE_TOKENS: Record<keyof typeof PALETTE, string> = {
  ink1: '--color-ink-1',
  ink2: '--color-ink-2',
  world0: '--color-world-0',
  world1: '--color-world-1',
  world2: '--color-world-2',
  grid: '--color-world-grid',
  gridStrong: '--color-world-grid-strong',
  accent: '--color-accent',
  fg: '--color-fg',
  axisX: '--color-axis-x',
  axisY: '--color-axis-y',
  axisZ: '--color-axis-z',
};

/** Derived for 3D only (the hidden half of the selection outline); not a UI token. */
export const ACCENT_DIM = '#6b4a14';

/** '#rrggbb' to the number three.js colour constructors take. */
export function hex(color: string): number {
  return parseInt(color.slice(1), 16);
}
