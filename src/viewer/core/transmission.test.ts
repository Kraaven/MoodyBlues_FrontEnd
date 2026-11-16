import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { flattenTransmission, originalTransmission } from './transmission';

describe('flattenTransmission', () => {
  it('turns transmission into blended transparency and remembers the original', () => {
    const glass = new THREE.MeshPhysicalMaterial({ transmission: 1, opacity: 1 });
    const rock = new THREE.MeshStandardMaterial();
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), glass), new THREE.Mesh(new THREE.BoxGeometry(), rock));

    flattenTransmission(root);
    expect(glass.transmission).toBe(0);
    expect(glass.transparent).toBe(true);
    expect(glass.depthWrite).toBe(false);
    expect(glass.opacity).toBeGreaterThan(0.2);
    expect(glass.opacity).toBeLessThan(0.6);
    expect(originalTransmission(glass)).toEqual({ transmission: 1, opacity: 1, transparent: false });
    expect(originalTransmission(rock)).toBeNull();

    // Running again (a second view of the same master) must not thin the glass further.
    const opacity = glass.opacity;
    flattenTransmission(root);
    expect(glass.opacity).toBe(opacity);
  });
});
