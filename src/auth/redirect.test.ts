import { describe, expect, it } from 'vitest';
import { safeRedirect } from './redirect';

describe('safeRedirect', () => {
  it('keeps same-origin paths with search and hash', () => {
    expect(safeRedirect('/studio/abc?t=3#x')).toBe('/studio/abc?t=3#x');
  });
  it('falls back for anything else', () => {
    for (const v of [undefined, null, 42, '', 'projects', '//evil.com', 'https://evil.com', '/\\evil.com']) {
      expect(safeRedirect(v)).toBe('/projects');
    }
  });
});
