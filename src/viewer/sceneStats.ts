import * as THREE from 'three';
import type { MeshInfo } from './viewerStore';

export interface SceneStats {
  objectCount: number;
  staticObjectCount: number;
  animatedObjectCount: number;
  totalVertices: number;
  totalTriangles: number;
  materialCount: number;
  textureCount: number;
  animationClipCount: number;
}

/** Node names targeted by at least one track across the given animation clips (via three.js's own track-name parser). */
function collectAnimatedNodeNames(clips: THREE.AnimationClip[]): Set<string> {
  const names = new Set<string>();
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      if (parsed.nodeName) {
        names.add(parsed.nodeName);
      }
    }
  }
  return names;
}

function triangleCount(geometry: THREE.BufferGeometry): number {
  if (geometry.index) {
    return geometry.index.count / 3;
  }
  return (geometry.attributes.position?.count ?? 0) / 3;
}

/**
 * "Static" here means a mesh that's neither a SkinnedMesh nor targeted by any track in any
 * animation clip -- i.e. it never moves once the scene is loaded.
 */
export function computeSceneStats(
  meshes: MeshInfo[],
  materialCount: number,
  textureCount: number,
  clips: THREE.AnimationClip[],
): SceneStats {
  const animatedNodeNames = collectAnimatedNodeNames(clips);

  let totalVertices = 0;
  let totalTriangles = 0;
  let staticObjectCount = 0;

  for (const { mesh, geometry } of meshes) {
    totalVertices += geometry.attributes.position?.count ?? 0;
    totalTriangles += triangleCount(geometry);

    const isSkinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh === true;
    const isAnimated = isSkinned || animatedNodeNames.has(mesh.name);
    if (!isAnimated) {
      staticObjectCount += 1;
    }
  }

  return {
    objectCount: meshes.length,
    staticObjectCount,
    animatedObjectCount: meshes.length - staticObjectCount,
    totalVertices,
    totalTriangles: Math.round(totalTriangles),
    materialCount,
    textureCount,
    animationClipCount: clips.length,
  };
}
