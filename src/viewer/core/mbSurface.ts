import * as THREE from 'three';
import { bakeLightmapUvs, type LightmappedMesh } from './lightmapUv';
import type { Look } from './look';
import { directionalLightsOf, skipDirectionalOnLightmapped } from './lightRules';
import { patchStandardFragment, AMBIENT_UNIFORM } from './mbShader';
import { readNodeLightmap, type FogMode, type MoodyScene, type SceneFog } from './sceneExtension';
import type { LoadedMoodyScene } from './sceneExtensionPlugin';

/**
 * MBSurface: the game look's materials.
 *
 * A loaded scene's standard and physical materials are made to shade like the Unity game did, by
 * patching three.js's own shader (see mbShader.ts) through `onBeforeCompile`. The materials are
 * patched IN PLACE, which keeps the GLB's own values (the inspector reads them) and means every
 * clone shares the patch: the replay animates a clone of the master and spawned objects are clones of
 * template nodes, all sharing these material objects. The one exception is a lightmapped mesh: its
 * material is cloned once per (material, lightmap) pair into a VARIANT that carries the lightmap, and
 * the original stays reachable through {@link originalOfMaterial}.
 *
 * What a material does is decided by its `defines` (MB_*), which three.js turns into one program per
 * combination (`customProgramCacheKey` is derived from them). Switching look is therefore a change of
 * defines and `needsUpdate` on each material, once: it never reloads the scene, and the program of
 * the look not shown stays cached, so switching back compiles nothing.
 */

/** The one ambient cube uniform every patched program reads; the scene on screen writes it ({@link MbSurface.setLook}). */
const ambientCubeUniform = { value: Array.from({ length: 6 }, () => new THREE.Vector3()) };

const origins = new WeakMap<THREE.Material, THREE.Material>();

/** The material the GLB described, for one of ours (a lightmap variant or a temporary copy); a material that is not ours is its own. */
export function originalOfMaterial<T extends THREE.Material>(material: T): THREE.Material {
  return origins.get(material) ?? material;
}

/** What a material is for in the game look. */
export interface MbDefineOptions {
  game: boolean;
  lightmapped: boolean;
  skipDirectional: boolean;
  fogMode: FogMode | null;
}

/** The MB_* defines for a material (empty outside the game look). */
export function mbDefines(o: MbDefineOptions): Record<string, string> {
  if (!o.game) return {};
  const defines: Record<string, string> = { MB_GAME: '' };
  if (o.lightmapped) {
    defines.MB_LIGHTMAP_RGBM = '';
    if (o.skipDirectional) defines.MB_SKIP_DIRECTIONAL = '';
  } else {
    defines.MB_AMBIENT_CUBE = '';
  }
  if (o.fogMode === 'linear') defines.MB_FOG_LINEAR = '';
  if (o.fogMode === 'exp') defines.MB_FOG_EXP = '';
  return defines;
}

/** The program cache key for a set of defines: materials with the same set share a program. */
export function mbCacheKey(defines: Readonly<Record<string, unknown>> | undefined): string {
  const names = Object.keys(defines ?? {}).filter((k) => k.startsWith('MB_')).sort();
  return names.length === 0 ? '' : `mb:${names.join(',')}`;
}

const warned = new Set<string>();

/** Shared by every patched material, and by materials that adopt a patch: `this` is the material being compiled. */
function onBeforeCompile(this: THREE.Material, shader: { uniforms: Record<string, THREE.IUniform>; fragmentShader: string }): void {
  // Always bound: a program this material already holds is not rebuilt when the look changes back.
  shader.uniforms[AMBIENT_UNIFORM] = ambientCubeUniform;
  if (!this.defines || !('MB_GAME' in (this.defines as object))) return;
  const { code, missed } = patchStandardFragment(shader.fragmentShader, THREE.ShaderChunk);
  for (const m of missed) {
    if (warned.has(m)) continue;
    warned.add(m);
    console.warn('[viewer] game look: shader patch did not match (three.js changed?):', m);
  }
  shader.fragmentShader = code;
}

function customProgramCacheKey(this: THREE.Material): string {
  return mbCacheKey(this.defines);
}

type Patchable = THREE.MeshStandardMaterial;

function isPatchable(material: THREE.Material | undefined): material is Patchable {
  return (material as Patchable | undefined)?.isMeshStandardMaterial === true;
}

function installHooks(material: Patchable): void {
  material.onBeforeCompile = onBeforeCompile as unknown as THREE.Material['onBeforeCompile'];
  material.customProgramCacheKey = customProgramCacheKey;
}

function definesOf(material: THREE.Material): Record<string, unknown> {
  material.defines ??= {};
  return material.defines as Record<string, unknown>;
}

function writeDefines(material: Patchable, defines: Record<string, string>): boolean {
  const current = definesOf(material);
  const before = mbCacheKey(current);
  for (const k of Object.keys(current)) if (k.startsWith('MB_')) delete current[k];
  Object.assign(current, defines);
  return before !== mbCacheKey(current);
}

/**
 * Makes `copy` (a `clone()` of `source`, for a fade or a highlight) shade exactly like `source`:
 * `Material.clone` does not carry the shader hooks or the defines. Also records the origin for the inspector.
 */
export function adoptSurface(source: THREE.Material, copy: THREE.Material): void {
  origins.set(copy, originalOfMaterial(source));
  if (!isPatchable(source) || !isPatchable(copy)) return;
  copy.onBeforeCompile = source.onBeforeCompile;
  copy.customProgramCacheKey = source.customProgramCacheKey;
  const defines = definesOf(copy);
  const from = definesOf(source);
  for (const k of Object.keys(from)) if (k.startsWith('MB_')) defines[k] = from[k];
  copy.needsUpdate = true;
}

interface MaterialState {
  lightmapped: boolean;
  /** The decoded lightmap texture and its `range * PI` (a variant only). */
  lightmap: THREE.Texture | null;
  intensity: number;
  originalDithering: boolean;
}

/** Unity's fog as a three.js fog: linear, or exponential (the shader's `MB_FOG_EXP` changes the curve for `exp`). Colour is linear. */
export function createFog(fog: SceneFog): THREE.Fog | THREE.FogExp2 {
  const color = new THREE.Color().setRGB(fog.color[0], fog.color[1], fog.color[2], THREE.LinearSRGBColorSpace);
  return fog.mode === 'linear' ? new THREE.Fog(color, fog.start, Math.max(fog.end, fog.start + 0.01)) : new THREE.FogExp2(color, fog.density);
}

/** The lightmapped meshes of a scene: nodes with `extras.lightmap`, and the primitive meshes of such a node. */
function collectLightmapped(root: THREE.Object3D, moody: MoodyScene): LightmappedMesh[] {
  const found: LightmappedMesh[] = [];
  root.traverse((node) => {
    const lightmap = readNodeLightmap(node.userData?.lightmap);
    if (!lightmap || !moody.lightmaps[lightmap.index]) return;
    if ((node as THREE.Mesh).isMesh) found.push({ mesh: node as THREE.Mesh, lightmap });
    else for (const child of node.children) if ((child as THREE.Mesh).isMesh && child.userData?.lightmap === undefined) found.push({ mesh: child as THREE.Mesh, lightmap });
  });
  return found;
}

export class MbSurface {
  private readonly states = new Map<Patchable, MaterialState>();
  private readonly variants: Patchable[] = [];
  private readonly lightmapTextures = new Set<THREE.Texture>();
  private look: Look | null = null;
  private disposed = false;
  /** Whether any mesh of the scene is lightmapped (the simple tier then draws no realtime shadows). */
  readonly lightmapped: boolean;
  readonly skipDirectional: boolean;

  private readonly loaded: LoadedMoodyScene;

  private constructor(root: THREE.Object3D, loaded: LoadedMoodyScene) {
    this.loaded = loaded;
    const { scene: moody, lightmaps } = loaded;
    this.skipDirectional = skipDirectionalOnLightmapped(directionalLightsOf(root), moody.mixedMode);

    const allMeshes: THREE.Mesh[] = [];
    root.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) allMeshes.push(node as THREE.Mesh);
    });

    // Lightmapped meshes: usable only with a decoded texture and a second UV set.
    const candidates = collectLightmapped(root, moody).filter((e) => lightmaps[e.lightmap.index]);
    const failed = new Set(bakeLightmapUvs(candidates, allMeshes));
    const lightmappedMeshes = candidates.filter((e) => !failed.has(e.mesh));
    if (failed.size > 0) console.debug(`[viewer] ${failed.size} lightmapped meshes have no second UV set and are lit by the ambient cube instead`);

    const variantFor = new Map<string, Patchable>();
    for (const { mesh, lightmap } of lightmappedMeshes) {
      const texture = lightmaps[lightmap.index]!;
      const range = moody.lightmaps[lightmap.index]!.range;
      const swap = (material: THREE.Material): THREE.Material => {
        if (!isPatchable(material)) return material;
        const key = `${material.uuid}:${lightmap.index}`;
        let variant = variantFor.get(key);
        if (!variant) {
          variant = material.clone() as Patchable;
          origins.set(variant, material);
          variantFor.set(key, variant);
          this.variants.push(variant);
          this.states.set(variant, { lightmapped: true, lightmap: texture, intensity: range * Math.PI, originalDithering: material.dithering });
          this.lightmapTextures.add(texture);
        }
        return variant;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    }
    this.lightmapped = lightmappedMeshes.length > 0;

    // Every standard material in use gets the hooks; the plain ones are patched in place.
    for (const mesh of allMeshes) {
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (!isPatchable(material)) continue;
        installHooks(material);
        if (!this.states.has(material)) this.states.set(material, { lightmapped: false, lightmap: null, intensity: 1, originalDithering: material.dithering });
      }
    }
  }

  /** Converts a loaded scene. Call before the bounds trees are built (lightmapped meshes may get a new geometry). */
  static create(root: THREE.Object3D, loaded: LoadedMoodyScene): MbSurface {
    return new MbSurface(root, loaded);
  }

  /**
   * Shows the scene with `look`: the game's own shading (defines, dithering, lightmaps), or the
   * materials as the file has them. Only materials whose program changes are marked for update.
   */
  setLook(look: Look): void {
    if (this.disposed) return;
    const game = look === 'game';
    if (game) {
      this.loaded.scene.ambientCube.forEach((c, i) => ambientCubeUniform.value[i].set(c[0], c[1], c[2]));
    }
    if (this.look === look) return;
    this.look = look;
    const fogMode = this.loaded.scene.fog?.mode ?? null;
    for (const [material, state] of this.states) {
      const defines = mbDefines({ game, lightmapped: state.lightmapped, skipDirectional: this.skipDirectional, fogMode });
      let changed = writeDefines(material, defines);
      const dithering = game ? true : state.originalDithering;
      if (material.dithering !== dithering) {
        material.dithering = dithering;
        changed = true;
      }
      if (state.lightmapped) {
        const map = game ? state.lightmap : null;
        if (material.lightMap !== map) {
          material.lightMap = map;
          changed = true;
        }
        material.lightMapIntensity = state.intensity;
      }
      if (changed) material.needsUpdate = true;
    }
  }

  /** Releases what this surface created: the variants, and the lightmap textures (which no material may hold in the studio look). */
  dispose(): void {
    this.disposed = true;
    for (const variant of this.variants) variant.dispose();
    for (const texture of this.lightmapTextures) texture.dispose();
  }
}
