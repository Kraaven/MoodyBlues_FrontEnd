/**
 * The 3D side of the design tokens. three.js cannot read CSS variables, so the values the scene
 * needs are repeated here. `palette.test.ts` parses `tokens.css` and fails if they drift apart.
 */
export const PALETTE = {
  ink0: '#04060d',
  ink1: '#080c18',
  ink2: '#0d1324',
  ink3: '#141c33',
  rule: '#1b2542',
  ruleStrong: '#2b3a63',
  blueDeep: '#1c3faa',
  blue: '#3d63f0',
  blueBright: '#8ca8ff',
  now: '#ffb547',
} as const;

/** Which CSS token each palette entry mirrors, for the drift test. */
export const PALETTE_TOKENS: Record<keyof typeof PALETTE, string> = {
  ink0: '--color-ink-0',
  ink1: '--color-ink-1',
  ink2: '--color-ink-2',
  ink3: '--color-ink-3',
  rule: '--color-rule',
  ruleStrong: '--color-rule-strong',
  blueDeep: '--color-blue-deep',
  blue: '--color-blue',
  blueBright: '--color-blue-bright',
  now: '--color-now',
};

/** Derived for 3D only (the dim half of the selection outline); not a UI token. */
export const NOW_DIM = '#6b4710';

/** '#rrggbb' to the number three.js colour constructors take. */
export function hex(color: string): number {
  return parseInt(color.slice(1), 16);
}
