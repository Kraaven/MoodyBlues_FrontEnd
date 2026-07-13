import * as THREE from 'three';
import type { MeshInfo } from './viewerStore';

export interface InspectionData {
  materials: THREE.Material[];
  textures: THREE.Texture[];
  meshes: MeshInfo[];
  skinnedMeshCount: number;
  staticCount: number;
  trackedCount: number;
  hiddenCount: number;
  preHiddenUuids: string[];
}

function getFlag(userData: Record<string, unknown>, key: string): unknown {
  for (const [k, v] of Object.entries(userData)) {
    if (k.toLowerCase() === key.toLowerCase()) return v;
  }
  return undefined;
}

/** Walks a loaded glTF scene graph once, collecting unique materials/textures/meshes and runtime flags. */
export function inspectScene(root: THREE.Object3D): InspectionData {
  const materials = new Map<string, THREE.Material>();
  const textures = new Map<string, THREE.Texture>();
  const meshes: MeshInfo[] = [];
  let skinnedMeshCount = 0;
  let staticCount = 0;
  let trackedCount = 0;
  let hiddenCount = 0;
  const preHiddenUuids: string[] = [];

  const textureKeys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'clearcoatMap', 'clearcoatNormalMap', 'transmissionMap', 'thicknessMap', 'sheenColorMap', 'specularMap'] as const;

  root.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) {
      skinnedMeshCount += 1;
    }

    const userData = (object.userData ?? {}) as Record<string, unknown>;
    if (getFlag(userData, 'isStatic')) staticCount += 1;
    if (getFlag(userData, 'objectId') !== undefined) trackedCount += 1;
    if (getFlag(userData, 'isHidden')) {
      hiddenCount += 1;
      preHiddenUuids.push(object.uuid);
    }

    if ((object as THREE.Mesh).isMesh) {
      const mesh = object as THREE.Mesh;
      meshes.push({ uuid: mesh.uuid, name: mesh.name || '(unnamed mesh)', mesh, geometry: mesh.geometry });

      const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of meshMaterials) {
        if (!material) continue;
        materials.set(material.uuid, material);

        for (const key of textureKeys) {
          const texture = (material as unknown as Record<string, THREE.Texture | undefined>)[key];
          if (texture && texture.isTexture) {
            textures.set(texture.uuid, texture);
          }
        }
      }
    }
  });

  return {
    materials: [...materials.values()],
    textures: [...textures.values()],
    meshes,
    skinnedMeshCount,
    staticCount,
    trackedCount,
    hiddenCount,
    preHiddenUuids,
  };
}
