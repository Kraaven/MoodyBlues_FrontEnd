import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSkyMaterial, skyKind } from './sky';
import type { RGB } from './sceneExtension';

const cube: RGB[] = [[0, 0, 0], [0, 0, 0], [0.7, 0.8, 0.9], [0.2, 0.2, 0.2], [0, 0, 0], [0, 0, 0]];

describe('sky', () => {
  it('picks the shader branch from the sky type', () => {
    expect(skyKind({ type: 'procedural', skyTint: [0.5, 0.5, 0.5], groundColor: [0, 0, 0], exposure: 1, sunSize: 0.04, sunSizeConvergence: 5, atmosphereThickness: 1 })).toBe('procedural');
    expect(skyKind({ type: 'color', color: [1, 0, 0] })).toBe('color');
    expect(skyKind({ type: 'other' })).toBe('gradient');
  });

  it('carries the procedural settings and a normalised sun direction', () => {
    const m = createSkyMaterial(
      { type: 'procedural', skyTint: [0.4, 0.5, 0.6], groundColor: [0.3, 0.2, 0.1], exposure: 1.25, sunSize: 0.05, sunSizeConvergence: 8, atmosphereThickness: 0.9 },
      cube,
      new THREE.Vector3(0, 2, 0),
    );
    expect(m.defines).toHaveProperty('SKY_PROCEDURAL');
    expect(m.uniforms.uExposure.value).toBe(1.25);
    expect(m.uniforms.uHasSun.value).toBe(1);
    expect((m.uniforms.uSunDir.value as THREE.Vector3).length()).toBeCloseTo(1);
  });

  it('has no sun disc without a sun, and uses the ambient cube for the gradient', () => {
    const m = createSkyMaterial({ type: 'other' }, cube, null);
    expect(m.defines).toHaveProperty('SKY_GRADIENT');
    expect(m.uniforms.uHasSun.value).toBe(0);
    expect((m.uniforms.uTop.value as THREE.Vector3).toArray()).toEqual([0.7, 0.8, 0.9]);
    expect((m.uniforms.uBottom.value as THREE.Vector3).toArray()).toEqual([0.2, 0.2, 0.2]);
  });

  it('uses the colour for a solid sky', () => {
    const m = createSkyMaterial({ type: 'color', color: [0.1, 0.2, 0.3] }, cube, null);
    expect(m.defines).toHaveProperty('SKY_COLOR');
    expect((m.uniforms.uColor.value as THREE.Vector3).toArray()).toEqual([0.1, 0.2, 0.3]);
  });
});
