import { describe, expect, it } from 'vitest';
import { evaluateAmbientCube, parseSceneExtension, readNodeLightmap, sceneExtensionOf, type RGB } from './sceneExtension';

const cube: RGB[] = [
  [1, 0, 0], // +X
  [0.5, 0, 0], // -X
  [0, 1, 0], // +Y
  [0, 0.5, 0], // -Y
  [0, 0, 1], // +Z
  [0, 0, 0.5], // -Z
];

const full = {
  version: 1,
  ambient: { cube },
  fog: { mode: 'exp2', color: [0.5, 0.6, 0.7], density: 0.0065, start: 0, end: 300 },
  sky: { type: 'procedural', skyTint: [0.5, 0.5, 0.5], groundColor: [0.3, 0.25, 0.2], exposure: 1.25, sunSize: 0.05, sunSizeConvergence: 8, atmosphereThickness: 0.9 },
  sun: 123,
  lighting: { mixedMode: 'subtractive' },
  post: { tonemapping: 'aces', postExposure: 0.5, bloom: null },
  lightmaps: [{ texture: 3, encoding: 'rgbm', range: 8 }],
};

describe('parseSceneExtension', () => {
  it('reads a complete extension', () => {
    const s = parseSceneExtension(full)!;
    expect(s.ambientCube).toEqual(cube);
    expect(s.fog).toEqual({ mode: 'exp2', color: [0.5, 0.6, 0.7], density: 0.0065, start: 0, end: 300 });
    expect(s.sky).toMatchObject({ type: 'procedural', exposure: 1.25, sunSizeConvergence: 8 });
    expect(s.sun).toBe(123);
    expect(s.mixedMode).toBe('subtractive');
    expect(s.post).toEqual({ tonemapping: 'aces', postExposure: 0.5 });
    expect(s.lightmaps).toEqual([{ texture: 3, range: 8 }]);
  });

  it('is null for missing input or an unknown version, and never throws', () => {
    for (const bad of [undefined, null, 5, 'x', [], {}, { version: 2 }]) expect(parseSceneExtension(bad)).toBeNull();
    expect(() => parseSceneExtension({ version: 1, ambient: 7, fog: [], sky: 'x', lightmaps: 'no', post: 4, lighting: null })).not.toThrow();
  });

  it('gives defaults for missing members', () => {
    const s = parseSceneExtension({ version: 1 })!;
    expect(s.ambientCube).toHaveLength(6);
    expect(s.fog).toBeNull();
    expect(s.sky).toEqual({ type: 'other' });
    expect(s.sun).toBeNull();
    expect(s.mixedMode).toBeNull();
    expect(s.post).toBeNull();
    expect(s.lightmaps).toEqual([]);
  });

  it('replaces a malformed ambient cube and drops a bad fog or sky', () => {
    const s = parseSceneExtension({ version: 1, ambient: { cube: [[1, 2, 3]] }, fog: { mode: 'weird', color: [1, 1, 1] }, sky: { type: 'color', color: ['a'] } })!;
    expect(s.ambientCube).toHaveLength(6);
    expect(s.fog).toBeNull();
    expect(s.sky).toEqual({ type: 'other' });
  });

  it('keeps lightmap indices: a bad entry is a null hole', () => {
    const s = parseSceneExtension({ version: 1, lightmaps: [{ texture: 0 }, { texture: 'x' }, { texture: 2, encoding: 'hdr' }, { texture: 4, range: -1 }] })!;
    expect(s.lightmaps).toEqual([{ texture: 0, range: 8 }, null, null, { texture: 4, range: 8 }]);
  });

  it('clamps negative or non-finite numbers', () => {
    const s = parseSceneExtension({ version: 1, ambient: { cube: Array(6).fill([-1, Infinity, 0.5]) }, post: { tonemapping: 'odd', postExposure: NaN } })!;
    expect(s.ambientCube).toEqual(Array(6).fill([0.2, 0.2, 0.2]));
    expect(s.post).toEqual({ tonemapping: 'none', postExposure: 0 });
  });

  it('finds the extension in a glTF root', () => {
    expect(sceneExtensionOf({ extensions: { MOODYBLUES_scene: full } })?.sun).toBe(123);
    expect(sceneExtensionOf({ extensions: {} })).toBeNull();
    expect(sceneExtensionOf(null)).toBeNull();
  });
});

describe('evaluateAmbientCube', () => {
  it('returns each face for an axis-aligned normal (axis order +X -X +Y -Y +Z -Z)', () => {
    expect(evaluateAmbientCube(cube, [1, 0, 0])).toEqual([1, 0, 0]);
    expect(evaluateAmbientCube(cube, [-1, 0, 0])).toEqual([0.5, 0, 0]);
    expect(evaluateAmbientCube(cube, [0, 1, 0])).toEqual([0, 1, 0]);
    expect(evaluateAmbientCube(cube, [0, -1, 0])).toEqual([0, 0.5, 0]);
    expect(evaluateAmbientCube(cube, [0, 0, 1])).toEqual([0, 0, 1]);
    expect(evaluateAmbientCube(cube, [0, 0, -1])).toEqual([0, 0, 0.5]);
  });

  it('weights faces by the squared normal components', () => {
    const s = Math.SQRT1_2;
    const c = evaluateAmbientCube(cube, [s, s, 0]);
    expect(c[0]).toBeCloseTo(0.5);
    expect(c[1]).toBeCloseTo(0.5);
    expect(c[2]).toBeCloseTo(0);
  });

  it('is constant for a uniform cube', () => {
    const flat: RGB[] = Array(6).fill([0.3, 0.2, 0.1]);
    const c = evaluateAmbientCube(flat, [0.6, -0.8, 0]);
    expect(c[0]).toBeCloseTo(0.3);
    expect(c[2]).toBeCloseTo(0.1);
  });
});

describe('readNodeLightmap', () => {
  it('reads index and scaleOffset', () => {
    expect(readNodeLightmap({ index: 2, scaleOffset: [0.5, 0.5, 0.25, 0.1] })).toEqual({ index: 2, scaleOffset: [0.5, 0.5, 0.25, 0.1] });
  });
  it('is null when malformed', () => {
    for (const bad of [undefined, {}, { index: -1, scaleOffset: [1, 1, 0, 0] }, { index: 0 }, { index: 0, scaleOffset: [1, 1, 0] }, { index: 0, scaleOffset: [1, 1, 0, 'x'] }]) expect(readNodeLightmap(bad)).toBeNull();
  });
});
