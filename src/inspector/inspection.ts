import * as THREE from 'three';

export interface MaterialInfo {
  material: THREE.Material;
  /** Meshes that use it. */
  users: THREE.Mesh[];
}

export interface SceneInspection {
  nodeCount: number;
  trackedCount: number;
  hiddenCount: number;
  meshCount: number;
  skinnedMeshCount: number;
  vertexCount: number;
  triangleCount: number;
  materials: MaterialInfo[];
  textures: THREE.Texture[];
  cameraCount: number;
  lightCount: number;
}

export const TEXTURE_SLOTS = [
  { key: 'map', label: 'Base color' },
  { key: 'normalMap', label: 'Normal' },
  { key: 'roughnessMap', label: 'Roughness' },
  { key: 'metalnessMap', label: 'Metallic' },
  { key: 'aoMap', label: 'Occlusion' },
  { key: 'emissiveMap', label: 'Emissive' },
  { key: 'alphaMap', label: 'Alpha' },
  { key: 'clearcoatMap', label: 'Clearcoat' },
  { key: 'transmissionMap', label: 'Transmission' },
] as const;

export function triangleCount(geometry: THREE.BufferGeometry): number {
  return Math.round((geometry.index ? geometry.index.count : (geometry.attributes.position?.count ?? 0)) / 3);
}

/** Walks a loaded scene once, collecting counts, materials and textures. */
export function inspectScene(root: THREE.Object3D): SceneInspection {
  const materials = new Map<string, MaterialInfo>();
  const textures = new Map<string, THREE.Texture>();
  const result: SceneInspection = {
    nodeCount: 0,
    trackedCount: 0,
    hiddenCount: 0,
    meshCount: 0,
    skinnedMeshCount: 0,
    vertexCount: 0,
    triangleCount: 0,
    materials: [],
    textures: [],
    cameraCount: 0,
    lightCount: 0,
  };

  root.traverse((node) => {
    if (node === root) return;
    result.nodeCount++;
    if (typeof node.userData?.objectId === 'number') result.trackedCount++;
    if (node.userData?.isHidden === true) result.hiddenCount++;
    if ((node as THREE.Camera).isCamera) result.cameraCount++;
    if ((node as THREE.Light).isLight) result.lightCount++;

    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    result.meshCount++;
    if ((node as THREE.SkinnedMesh).isSkinnedMesh) result.skinnedMeshCount++;
    result.vertexCount += mesh.geometry.attributes.position?.count ?? 0;
    result.triangleCount += triangleCount(mesh.geometry);

    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material) continue;
      const info = materials.get(material.uuid) ?? { material, users: [] };
      info.users.push(mesh);
      materials.set(material.uuid, info);
      for (const { key } of TEXTURE_SLOTS) {
        const texture = (material as unknown as Record<string, THREE.Texture | undefined>)[key];
        if (texture?.isTexture) textures.set(texture.uuid, texture);
      }
    }
  });

  result.materials = [...materials.values()].sort((a, b) => b.users.length - a.users.length);
  result.textures = [...textures.values()];
  return result;
}

export function nodeType(node: THREE.Object3D): string {
  if ((node as THREE.InstancedMesh).isInstancedMesh) return 'Instanced mesh';
  if ((node as THREE.SkinnedMesh).isSkinnedMesh) return 'Skinned mesh';
  if ((node as THREE.Mesh).isMesh) return 'Mesh';
  if ((node as THREE.Bone).isBone) return 'Bone';
  if ((node as THREE.Light).isLight) return 'Light';
  if ((node as THREE.Camera).isCamera) return 'Camera';
  return 'Transform';
}

export function colorHex(material: THREE.Material, key: 'color' | 'emissive'): string | null {
  const value = (material as unknown as Record<string, unknown>)[key];
  return value instanceof THREE.Color ? `#${value.getHexString()}` : null;
}
