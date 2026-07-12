import * as THREE from 'three';
import type { MeshInfo } from './viewerStore';

export interface InspectionData {
  materials: THREE.Material[];
  textures: THREE.Texture[];
  meshes: MeshInfo[];
  skinnedMeshCount: number;
}

/** Walks a loaded glTF scene graph once, collecting the unique materials/textures/meshes it uses. */
export function inspectScene(root: THREE.Object3D): InspectionData {
  const materials = new Map<string, THREE.Material>();
  const textures = new Map<string, THREE.Texture>();
  const meshes: MeshInfo[] = [];
  let skinnedMeshCount = 0;

  const textureKeys = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'clearcoatMap', 'clearcoatNormalMap', 'transmissionMap', 'thicknessMap', 'sheenColorMap', 'specularMap'] as const;

  root.traverse((object) => {
    if ((object as THREE.SkinnedMesh).isSkinnedMesh) {
      skinnedMeshCount += 1;
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
  };
}
