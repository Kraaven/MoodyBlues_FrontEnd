import { describe, expect, it } from 'vitest';
import { readLook, realtimeShadows, resolveQualityTier, shadowMapSize, STUDIO_EXPOSURE, toneMappingFor } from './look';

describe('resolveQualityTier', () => {
  it('is simple on a phone and full elsewhere', () => {
    expect(resolveQualityTier('', true)).toBe('simple');
    expect(resolveQualityTier('', false)).toBe('full');
  });
  it('lets the address force either tier', () => {
    expect(resolveQualityTier('?quality=simple', false)).toBe('simple');
    expect(resolveQualityTier('?stage=on&quality=full', true)).toBe('full');
  });
  it('ignores an unknown value', () => {
    expect(resolveQualityTier('?quality=ultra', true)).toBe('simple');
  });
});

describe('shadows', () => {
  it('sizes the map by tier', () => {
    expect(shadowMapSize('simple')).toBe(1024);
    expect(shadowMapSize('full')).toBe(2048);
  });
  it('turns realtime shadows off for a lightmapped game scene on simple', () => {
    expect(realtimeShadows(true, 'simple', 'game', true)).toBe(false);
    expect(realtimeShadows(true, 'simple', 'game', false)).toBe(true);
    expect(realtimeShadows(true, 'simple', 'studio', true)).toBe(true);
    expect(realtimeShadows(true, 'full', 'game', true)).toBe(true);
    expect(realtimeShadows(false, 'full', 'game', false)).toBe(false);
  });
});

describe('readLook', () => {
  it('accepts the two looks and defaults to game', () => {
    expect(readLook('studio')).toBe('studio');
    expect(readLook('game')).toBe('game');
    expect(readLook('analysis')).toBe('game');
    expect(readLook(undefined, 'studio')).toBe('studio');
  });
});

describe('toneMappingFor', () => {
  it('uses Neutral at the studio exposure for the studio look', () => {
    expect(toneMappingFor('studio', null)).toEqual({ mapper: 'neutral', exposure: STUDIO_EXPOSURE });
  });
  it('follows the scene post settings in the game look', () => {
    expect(toneMappingFor('game', { tonemapping: 'aces', postExposure: 1 })).toEqual({ mapper: 'aces', exposure: 2 });
    expect(toneMappingFor('game', { tonemapping: 'none', postExposure: 0 })).toEqual({ mapper: 'neutral', exposure: 1 });
  });
  it('ignores the scene post settings in the studio look', () => {
    expect(toneMappingFor('studio', { tonemapping: 'aces', postExposure: 2 }).mapper).toBe('neutral');
  });
  it('is neutral at 1 for a game scene without post settings', () => {
    expect(toneMappingFor('game', null)).toEqual({ mapper: 'neutral', exposure: 1 });
  });
});
