import { describe, expect, it } from 'vitest';
import { parseStartTime, shareUrl, viewLink } from './shareLink';

describe('shareUrl', () => {
  const token = 'abcDEF123-_abcDEF123-_abcDEF123-_abcDEF123-_a';
  it('builds the public path', () => {
    expect(shareUrl('https://x.test', token)).toBe(`https://x.test/share/${token}`);
  });
  it('appends the time only when it is positive and finite', () => {
    expect(shareUrl('https://x.test', token, 12.3456)).toBe(`https://x.test/share/${token}?t=12.35`);
    expect(shareUrl('https://x.test', token, 0)).toBe(`https://x.test/share/${token}`);
    expect(shareUrl('https://x.test', token, null)).toBe(`https://x.test/share/${token}`);
    expect(shareUrl('https://x.test', token, Number.NaN)).toBe(`https://x.test/share/${token}`);
  });
});

describe('viewLink', () => {
  it('carries the version', () => {
    expect(viewLink('https://x.test', '/projects/p/scenes/s', 3)).toBe('https://x.test/projects/p/scenes/s/view?version=3');
  });
});

describe('parseStartTime', () => {
  it('reads positive seconds and ignores the rest', () => {
    expect(parseStartTime('4.5')).toBe(4.5);
    expect(parseStartTime(null)).toBe(0);
    expect(parseStartTime('-2')).toBe(0);
    expect(parseStartTime('abc')).toBe(0);
  });
});
