import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { bakeLightmapUvs, transformedUvAttribute, transformUv, type LightmappedMesh } from './lightmapUv';

function quad(withUv1 = true): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0], 3));
  if (withUv1) g.setAttribute('uv1', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

const lm = (so: [number, number, number, number]): LightmappedMesh['lightmap'] => ({ index: 0, scaleOffset: so });
const uv = (g: THREE.BufferGeometry) => Array.from((g.getAttribute('uv1') as THREE.BufferAttribute).array);

describe('transformUv', () => {
  it('scales then offsets', () => {
    expect(transformUv(0.5, 1, [0.5, 0.25, 0.1, 0.2])).toEqual([0.35, 0.45]);
  });
  it('maps the unit square onto the atlas rectangle', () => {
    expect(transformUv(0, 0, [0.5, 0.5, 0.5, 0])).toEqual([0.5, 0]);
    expect(transformUv(1, 1, [0.5, 0.5, 0.5, 0])).toEqual([1, 0.5]);
  });
});

describe('transformedUvAttribute', () => {
  it('reads normalized 16-bit sources as floats', () => {
    const q = new THREE.BufferAttribute(new Uint16Array([0, 65535, 65535, 0]), 2, true);
    const out = transformedUvAttribute(q, [0.5, 0.5, 0.25, 0.25]);
    expect(out.array).toBeInstanceOf(Float32Array);
    expect(out.getX(0)).toBeCloseTo(0.25);
    expect(out.getY(0)).toBeCloseTo(0.75);
    expect(out.getX(1)).toBeCloseTo(0.75);
  });
});

describe('bakeLightmapUvs', () => {
  const mesh = (g: THREE.BufferGeometry) => new THREE.Mesh(g, new THREE.MeshStandardMaterial());

  it('changes a geometry in place when every user has the same scaleOffset', () => {
    const g = quad();
    const a = mesh(g);
    const b = mesh(g);
    const so = [0.5, 0.5, 0.5, 0] as [number, number, number, number];
    const failed = bakeLightmapUvs([{ mesh: a, lightmap: lm(so) }, { mesh: b, lightmap: lm(so) }], [a, b]);
    expect(failed).toEqual([]);
    expect(a.geometry).toBe(g);
    expect(uv(g)).toEqual([0.5, 0, 1, 0, 1, 0.5, 0.5, 0.5]);
  });

  it('derives one geometry per scaleOffset when they differ, sharing buffers', () => {
    const g = quad();
    const a = mesh(g);
    const b = mesh(g);
    const c = mesh(g);
    bakeLightmapUvs(
      [
        { mesh: a, lightmap: lm([0.5, 0.5, 0, 0]) },
        { mesh: b, lightmap: lm([0.5, 0.5, 0.5, 0.5]) },
        { mesh: c, lightmap: lm([0.5, 0.5, 0, 0]) },
      ],
      [a, b, c],
    );
    expect(a.geometry).not.toBe(g);
    expect(a.geometry).toBe(c.geometry);
    expect(a.geometry).not.toBe(b.geometry);
    expect(a.geometry.getAttribute('position')).toBe(g.getAttribute('position'));
    expect(a.geometry.index).toBe(g.index);
    expect(uv(a.geometry)).toEqual([0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5]);
    expect(uv(b.geometry)).toEqual([0.5, 0.5, 1, 0.5, 1, 1, 0.5, 1]);
    // The source is untouched.
    expect(uv(g)).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
  });

  it('leaves the original alone when an unlightmapped mesh shares it', () => {
    const g = quad();
    const lit = mesh(g);
    const plain = mesh(g);
    bakeLightmapUvs([{ mesh: lit, lightmap: lm([0.5, 0.5, 0.5, 0.5]) }], [lit, plain]);
    expect(plain.geometry).toBe(g);
    expect(lit.geometry).not.toBe(g);
    expect(uv(g)).toEqual([0, 0, 1, 0, 1, 1, 0, 1]);
  });

  it('reports meshes without a second UV set', () => {
    const a = mesh(quad(false));
    expect(bakeLightmapUvs([{ mesh: a, lightmap: lm([1, 1, 0, 0]) }], [a])).toEqual([a]);
  });
});
