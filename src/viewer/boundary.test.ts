import { describe, expect, it } from 'vitest';

/**
 * DESIGN.md 12.1: the viewer knows nothing about routing, the API, auth or the app's own layers, so
 * it can be tested alone and reused. Everything under src/viewer (except tests) is checked.
 */
const sources = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.ts', '!./**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const FORBIDDEN = [
  /from\s+['"]react-router(-dom)?['"]/,
  /from\s+['"]@tanstack\//,
  /from\s+['"](\.\.\/)+(api|auth|stage|player|pages|inspector|shell|ui|lib)\//,
];

describe('src/viewer boundary', () => {
  it('finds the viewer sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(5);
  });

  it('imports nothing from the app', () => {
    const offenders: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      for (const rule of FORBIDDEN) {
        const hit = rule.exec(text);
        if (hit) offenders.push(`${file}: ${hit[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
