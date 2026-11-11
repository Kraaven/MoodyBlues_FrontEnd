/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hex, PALETTE, PALETTE_TOKENS } from './palette';

// Vitest replaces CSS imports with an empty string, even with ?raw, so the file is read directly.
const tokens = readFileSync(new URL('../../styles/tokens.css', import.meta.url), 'utf8');

describe('palette', () => {
  it('matches the CSS design tokens, so the 3D scene and the page cannot drift apart', () => {
    for (const [key, token] of Object.entries(PALETTE_TOKENS)) {
      const match = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens);
      expect(match, `${token} is missing from tokens.css`).not.toBeNull();
      expect(PALETTE[key as keyof typeof PALETTE].toLowerCase(), token).toBe(match![1].toLowerCase());
    }
  });

  it('turns a hex string into a number', () => {
    expect(hex('#f5b544')).toBe(0xf5b544);
  });
});
