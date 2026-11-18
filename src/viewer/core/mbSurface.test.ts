import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { adoptSurface, createFog, mbCacheKey, mbDefines, MbSurface, originalOfMaterial } from './mbSurface';
import { parseSceneExtension } from './sceneExtension';
import type { LoadedMoodyScene } from './sceneExtensionPlugin';

const base = {
  version: 1,
  ambient: { cube: [[1, 0, 0], [0.5, 0, 0], [0, 1, 0], [0, 0.5, 0], [0, 0, 1], [0, 0, 0.5]] },
  fog: { mode: 'exp', color: [0.5, 0.6, 0.7], density: 0.02, start: 0, end: 100 },
  lighting: { mixedMode: 'subtractive' },
  lightmaps: [{ texture: 0, encoding: 'rgbm', range: 8 }],
};

function loaded(extra: Record<string, unknown> = {}, texture: THREE.Texture | null = new THREE.Texture()): LoadedMoodyScene {
  return { scene: parseSceneExtension({ ...base, ...extra })!, lightmaps: [texture] };
}

function quad(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0], 3));
  g.setAttribute('uv1', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1], 2));
  return g;
}

/** A scene: a plain mesh, two lightmapped meshes sharing a material and geometry, a baked directional light. */
function synthetic(bake: string = 'baked') {
  const root = new THREE.Group();
  const shared = new THREE.MeshStandardMaterial({ color: '#808080', name: 'shared' });
  const geometry = quad();

  const plain = new THREE.Mesh(geometry, shared);
  plain.name = 'plain';
  const lit1 = new THREE.Mesh(geometry, shared);
  lit1.userData = { objectId: 1, lightmap: { index: 0, scaleOffset: [0.5, 0.5, 0, 0] } };
  const lit2 = new THREE.Mesh(geometry, shared);
  lit2.userData = { objectId: 2, lightmap: { index: 0, scaleOffset: [0.5, 0.5, 0.5, 0.5] } };

  const sun = new THREE.Object3D();
  sun.userData = { lightBake: bake };
  sun.add(new THREE.DirectionalLight());
  root.add(plain, lit1, lit2, sun);
  return { root, shared, geometry, plain, lit1, lit2 };
}

const fakeShader = (fragment = THREE.ShaderLib.standard.fragmentShader) => ({ uniforms: {} as Record<string, THREE.IUniform>, fragmentShader: fragment });
const compile = (m: THREE.Material, shader = fakeShader()) => {
  (m.onBeforeCompile as unknown as (s: typeof shader) => void).call(m, shader);
  return shader;
};

describe('mbDefines / mbCacheKey', () => {
  it('is empty outside the game look', () => {
    expect(mbDefines({ game: false, lightmapped: true, skipDirectional: true, fogMode: 'exp' })).toEqual({});
  });
  it('gives a plain material the ambient cube and a lightmapped one the lightmap', () => {
    expect(Object.keys(mbDefines({ game: true, lightmapped: false, skipDirectional: true, fogMode: null }))).toEqual(['MB_GAME', 'MB_AMBIENT_CUBE']);
    expect(Object.keys(mbDefines({ game: true, lightmapped: true, skipDirectional: true, fogMode: null }))).toEqual(['MB_GAME', 'MB_LIGHTMAP_RGBM', 'MB_SKIP_DIRECTIONAL']);
    expect(Object.keys(mbDefines({ game: true, lightmapped: true, skipDirectional: false, fogMode: 'linear' }))).toEqual(['MB_GAME', 'MB_LIGHTMAP_RGBM', 'MB_FOG_LINEAR']);
    expect(mbDefines({ game: true, lightmapped: false, skipDirectional: false, fogMode: 'exp' })).toHaveProperty('MB_FOG_EXP');
    expect(mbDefines({ game: true, lightmapped: false, skipDirectional: false, fogMode: 'exp2' })).not.toHaveProperty('MB_FOG_EXP');
  });
  it('derives a stable key from the MB defines only', () => {
    expect(mbCacheKey({ STANDARD: '' })).toBe('');
    expect(mbCacheKey({ MB_B: '', STANDARD: '', MB_A: '' })).toBe('mb:MB_A,MB_B');
  });
});

describe('createFog', () => {
  it('builds a linear Fog and an exponential FogExp2 in linear colour', () => {
    const lin = createFog({ mode: 'linear', color: [0.2, 0.4, 0.6], density: 0, start: 10, end: 90 }) as THREE.Fog;
    expect(lin.isFog).toBe(true);
    expect([lin.near, lin.far]).toEqual([10, 90]);
    expect(lin.color.r).toBeCloseTo(0.2);
    expect((createFog({ mode: 'exp', color: [1, 1, 1], density: 0.02, start: 0, end: 0 }) as THREE.FogExp2).density).toBe(0.02);
    expect((createFog({ mode: 'exp2', color: [1, 1, 1], density: 0.01, start: 0, end: 0 }) as THREE.FogExp2).isFogExp2).toBe(true);
  });
});

describe('MbSurface', () => {
  it('makes one variant per (material, lightmap) and leaves the plain mesh on the original', () => {
    const { root, shared, plain, lit1, lit2 } = synthetic();
    MbSurface.create(root, loaded());
    expect(plain.material).toBe(shared);
    expect(lit1.material).not.toBe(shared);
    expect(lit1.material).toBe(lit2.material);
    expect(originalOfMaterial(lit1.material as THREE.Material)).toBe(shared);
    expect(originalOfMaterial(shared)).toBe(shared);
    // The original keeps the GLB's values.
    expect(shared.color.getHexString()).toBe('808080');
    expect(shared.lightMap).toBeNull();
  });

  it('gives each scaleOffset its own geometry, sharing buffers, with the uv1 moved', () => {
    const { root, geometry, plain, lit1, lit2 } = synthetic();
    MbSurface.create(root, loaded());
    expect(plain.geometry).toBe(geometry);
    expect(lit1.geometry).not.toBe(lit2.geometry);
    expect(lit1.geometry.getAttribute('position')).toBe(geometry.getAttribute('position'));
    expect(Array.from((lit2.geometry.getAttribute('uv1') as THREE.BufferAttribute).array)).toEqual([0.5, 0.5, 1, 0.5, 1, 1]);
  });

  it('sets game defines, dithering, lightmap and RGBM intensity in the game look', () => {
    const { root, shared, lit1 } = synthetic();
    const texture = new THREE.Texture();
    const surface = MbSurface.create(root, loaded({}, texture));
    surface.setLook('game');
    const variant = lit1.material as THREE.MeshStandardMaterial;
    expect(Object.keys(variant.defines!).filter((k) => k.startsWith('MB_')).sort()).toEqual(['MB_FOG_EXP', 'MB_GAME', 'MB_LIGHTMAP_RGBM', 'MB_SKIP_DIRECTIONAL']);
    expect(Object.keys(shared.defines!).filter((k) => k.startsWith('MB_')).sort()).toEqual(['MB_AMBIENT_CUBE', 'MB_FOG_EXP', 'MB_GAME']);
    expect(variant.lightMap).toBe(texture);
    expect(variant.lightMapIntensity).toBeCloseTo(8 * Math.PI);
    expect(variant.dithering).toBe(true);
    expect(shared.dithering).toBe(true);
    expect(variant.customProgramCacheKey()).not.toBe(shared.customProgramCacheKey());
    expect(surface.lightmapped).toBe(true);
    expect(surface.skipDirectional).toBe(true);
  });

  it('does not skip directional lights when a realtime one exists, or the mixed mode is not subtractive', () => {
    expect(MbSurface.create(synthetic('realtime').root, loaded()).skipDirectional).toBe(false);
    expect(MbSurface.create(synthetic('mixed').root, loaded({ lighting: { mixedMode: 'shadowmask' } })).skipDirectional).toBe(false);
    expect(MbSurface.create(synthetic('mixed').root, loaded()).skipDirectional).toBe(true);
  });

  it('returns to the file materials in the studio look, and marks materials for update only when the program changes', () => {
    const { root, shared, lit1 } = synthetic();
    const surface = MbSurface.create(root, loaded());
    surface.setLook('game');
    const variant = lit1.material as THREE.MeshStandardMaterial;
    const versions = [shared.version, variant.version];
    surface.setLook('game');
    expect([shared.version, variant.version]).toEqual(versions);
    surface.setLook('studio');
    expect(Object.keys(shared.defines!).filter((k) => k.startsWith('MB_'))).toEqual([]);
    expect(shared.dithering).toBe(false);
    expect(variant.lightMap).toBeNull();
    expect(variant.customProgramCacheKey()).toBe('');
    expect(shared.version).toBeGreaterThan(versions[0]);
    surface.setLook('game');
    expect(shared.customProgramCacheKey()).toBe('mb:MB_AMBIENT_CUBE,MB_FOG_EXP,MB_GAME');
  });

  it('writes the ambient cube into the shared uniform and binds it when compiling', () => {
    const { root, shared } = synthetic();
    MbSurface.create(root, loaded()).setLook('game');
    const shader = compile(shared);
    const uniform = shader.uniforms.mbAmbientCube as { value: THREE.Vector3[] };
    expect(uniform.value).toHaveLength(6);
    expect(uniform.value[0].toArray()).toEqual([1, 0, 0]);
    expect(uniform.value[3].toArray()).toEqual([0, 0.5, 0]);
  });

  it('patches the real shader when compiled in the game look, with no replacement missed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { root, shared, lit1 } = synthetic();
    MbSurface.create(root, loaded()).setLook('game');
    for (const m of [shared, lit1.material as THREE.Material]) {
      const shader = compile(m);
      expect(shader.fragmentShader).toContain('mbAmbient(');
      expect(shader.fragmentShader).not.toContain('#include <lights_fragment_begin>');
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('leaves the shader alone in the studio look but still binds the uniform', () => {
    const { root, shared } = synthetic();
    const surface = MbSurface.create(root, loaded());
    surface.setLook('game');
    surface.setLook('studio');
    const shader = compile(shared);
    expect(shader.fragmentShader).toBe(THREE.ShaderLib.standard.fragmentShader);
    expect(shader.uniforms.mbAmbientCube).toBeDefined();
  });

  it('patches physical materials too', () => {
    const root = new THREE.Group();
    const physical = new THREE.MeshPhysicalMaterial({ clearcoat: 1 });
    root.add(new THREE.Mesh(quad(), physical));
    MbSurface.create(root, loaded()).setLook('game');
    const shader = compile(physical, fakeShader(THREE.ShaderLib.physical.fragmentShader));
    expect(shader.fragmentShader).toContain('mbAmbient(');
  });

  it('treats a lightmap whose texture failed to load as unlit by the lightmap', () => {
    const { root, shared, lit1 } = synthetic();
    const surface = MbSurface.create(root, loaded({}, null));
    expect(lit1.material).toBe(shared);
    expect(surface.lightmapped).toBe(false);
  });

  it('skips meshes without a second UV set', () => {
    const root = new THREE.Group();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 1, 1, 0], 3));
    const material = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh(g, material);
    mesh.userData = { lightmap: { index: 0, scaleOffset: [1, 1, 0, 0] } };
    root.add(mesh);
    const surface = MbSurface.create(root, loaded());
    expect(mesh.material).toBe(material);
    expect(surface.lightmapped).toBe(false);
  });

  it('lightmaps the primitive meshes of a multi-primitive node', () => {
    const root = new THREE.Group();
    const group = new THREE.Group();
    group.userData = { objectId: 5, lightmap: { index: 0, scaleOffset: [1, 1, 0, 0] } };
    const a = new THREE.Mesh(quad(), new THREE.MeshStandardMaterial());
    const b = new THREE.Mesh(quad(), new THREE.MeshStandardMaterial());
    group.add(a, b);
    root.add(group);
    MbSurface.create(root, loaded());
    expect(originalOfMaterial(a.material as THREE.Material)).not.toBe(a.material);
    expect(originalOfMaterial(b.material as THREE.Material)).not.toBe(b.material);
  });

  it('survives cloning the scene: clones share the patched materials', () => {
    const { root, lit1 } = synthetic();
    const surface = MbSurface.create(root, loaded());
    surface.setLook('game');
    const copy = root.clone();
    const cloned = copy.children.find((c) => c.userData.objectId === 1) as THREE.Mesh;
    expect(cloned.material).toBe(lit1.material);
    surface.setLook('studio');
    expect((cloned.material as THREE.MeshStandardMaterial).lightMap).toBeNull();
  });

  it('lets a cloned material adopt the patch and remember its original', () => {
    const { root, shared } = synthetic();
    MbSurface.create(root, loaded()).setLook('game');
    const copy = shared.clone();
    expect(Object.keys(copy.defines!).some((k) => k.startsWith('MB_'))).toBe(false);
    adoptSurface(shared, copy);
    expect(copy.customProgramCacheKey()).toBe(shared.customProgramCacheKey());
    expect(copy.onBeforeCompile).toBe(shared.onBeforeCompile);
    expect(originalOfMaterial(copy)).toBe(shared);
  });

  it('dispose releases the lightmap texture even while no material holds it', () => {
    const { root } = synthetic();
    const texture = new THREE.Texture();
    const spy = vi.spyOn(texture, 'dispose');
    const surface = MbSurface.create(root, loaded({}, texture));
    surface.setLook('studio');
    surface.dispose();
    expect(spy).toHaveBeenCalled();
  });
});
