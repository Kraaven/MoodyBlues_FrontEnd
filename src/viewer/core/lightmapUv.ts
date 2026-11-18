import * as THREE from 'three';
import type { NodeLightmap } from './sceneExtension';

/** [sx, sy, ox, oy]: `lightmapUV = uv1 * (sx, sy) + (ox, oy)`, in glTF UV space. */
export type ScaleOffset = readonly [number, number, number, number];

/** A UV pair moved into its lightmap's atlas rectangle. */
export function transformUv(u: number, v: number, so: ScaleOffset): [number, number] {
  return [u * so[0] + so[2], v * so[1] + so[3]];
}

/**
 * A new two-component float attribute holding `source` (any accessor-backed attribute, normalized or
 * interleaved) moved by `so`. Always a fresh float32 array: the source may be shared with other
 * geometries (glTF accessors are cached), and a quantized 16-bit source would round the result.
 */
export function transformedUvAttribute(source: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, so: ScaleOffset): THREE.BufferAttribute {
  const out = new Float32Array(source.count * 2);
  for (let i = 0; i < source.count; i++) {
    const [u, v] = transformUv(source.getX(i), source.getY(i), so);
    out[i * 2] = u;
    out[i * 2 + 1] = v;
  }
  return new THREE.BufferAttribute(out, 2);
}

const soKey = (so: ScaleOffset) => so.join(',');

/** A geometry sharing every buffer of `source` except `uv1`, which is `uv1`. Cheap: nothing is copied but the small parts. */
function withUv1(source: THREE.BufferGeometry, uv1: THREE.BufferAttribute): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.name = source.name;
  g.userData = { ...source.userData };
  if (source.index) g.setIndex(source.index);
  for (const [name, attribute] of Object.entries(source.attributes)) g.setAttribute(name, attribute);
  g.setAttribute('uv1', uv1);
  for (const [name, list] of Object.entries(source.morphAttributes)) (g.morphAttributes as Record<string, typeof list>)[name] = list;
  g.morphTargetsRelative = source.morphTargetsRelative;
  for (const group of source.groups) g.addGroup(group.start, group.count, group.materialIndex);
  g.drawRange = { ...source.drawRange };
  if (source.boundingBox) g.boundingBox = source.boundingBox.clone();
  if (source.boundingSphere) g.boundingSphere = source.boundingSphere.clone();
  return g;
}

export interface LightmappedMesh {
  mesh: THREE.Mesh;
  lightmap: NodeLightmap;
}

/**
 * Moves each lightmapped mesh's `uv1` into its atlas rectangle, once, so the shader samples the
 * lightmap with the plain UV. A geometry used only by meshes with the same scaleOffset is changed
 * in place; one that several scaleOffsets (or an unlightmapped mesh) share is given one derived
 * geometry per scaleOffset, sharing all buffers but `uv1`. Returns the meshes that could not be
 * done (no `uv1`: the optimizer dropped it, say); they must not be treated as lightmapped.
 * `allMeshes` is every mesh of the scene, to know who else shares a geometry.
 */
export function bakeLightmapUvs(lightmapped: readonly LightmappedMesh[], allMeshes: readonly THREE.Mesh[]): THREE.Mesh[] {
  const users = new Map<THREE.BufferGeometry, number>();
  for (const mesh of allMeshes) users.set(mesh.geometry, (users.get(mesh.geometry) ?? 0) + 1);

  const byGeometry = new Map<THREE.BufferGeometry, Map<string, LightmappedMesh[]>>();
  const failed: THREE.Mesh[] = [];
  for (const entry of lightmapped) {
    const geometry = entry.mesh.geometry;
    if (!geometry.getAttribute('uv1')) {
      failed.push(entry.mesh);
      continue;
    }
    const keys = byGeometry.get(geometry) ?? new Map<string, LightmappedMesh[]>();
    const list = keys.get(soKey(entry.lightmap.scaleOffset)) ?? [];
    list.push(entry);
    keys.set(soKey(entry.lightmap.scaleOffset), list);
    byGeometry.set(geometry, keys);
  }

  for (const [geometry, keys] of byGeometry) {
    const source = geometry.getAttribute('uv1');
    const sharers = [...keys.values()].reduce((n, list) => n + list.length, 0);
    if (keys.size === 1 && sharers === users.get(geometry)) {
      const [list] = keys.values();
      geometry.setAttribute('uv1', transformedUvAttribute(source, list[0].lightmap.scaleOffset));
      continue;
    }
    for (const list of keys.values()) {
      const derived = withUv1(geometry, transformedUvAttribute(source, list[0].lightmap.scaleOffset));
      for (const { mesh } of list) mesh.geometry = derived;
    }
  }
  return failed;
}
