import * as THREE from 'three';

/**
 * Reading a loaded scene for the inspector (DESIGN.md 7.8).
 *
 * The approach to materials, textures, geometries and the statistics is adapted from
 * glb-viewer-core (https://github.com/ohzinteractive/glb-viewer-core, MIT licence, Copyright
 * OHZI Interactive Studio): Materials/MaterialDetails (which properties a material shows), Textures
 * (gathering textures from every material channel and de-duplicating by image source), GeometryItem
 * (vertex counts, attributes and the meshes sharing a geometry) and Info (vertex statistics). This is a
 * re-implementation in TypeScript against our own types, not a copy of their code.
 */

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

/** Every material property that can hold a texture, with the label the panel shows (three.js names). */
export const TEXTURE_CHANNELS: { key: string; label: string }[] = [
  { key: 'map', label: 'Base color map' },
  { key: 'normalMap', label: 'Normal map' },
  { key: 'roughnessMap', label: 'Roughness map' },
  { key: 'metalnessMap', label: 'Metalness map' },
  { key: 'aoMap', label: 'Occlusion map' },
  { key: 'emissiveMap', label: 'Emissive map' },
  { key: 'alphaMap', label: 'Alpha map' },
  { key: 'displacementMap', label: 'Displacement map' },
  { key: 'bumpMap', label: 'Bump map' },
  { key: 'lightMap', label: 'Light map' },
  { key: 'envMap', label: 'Environment map' },
  { key: 'specularMap', label: 'Specular map' },
  { key: 'specularColorMap', label: 'Specular color map' },
  { key: 'specularIntensityMap', label: 'Specular intensity map' },
  { key: 'clearcoatMap', label: 'Clearcoat map' },
  { key: 'clearcoatRoughnessMap', label: 'Clearcoat roughness map' },
  { key: 'clearcoatNormalMap', label: 'Clearcoat normal map' },
  { key: 'transmissionMap', label: 'Transmission map' },
  { key: 'thicknessMap', label: 'Thickness map' },
  { key: 'sheenColorMap', label: 'Sheen color map' },
  { key: 'sheenRoughnessMap', label: 'Sheen roughness map' },
  { key: 'iridescenceMap', label: 'Iridescence map' },
  { key: 'anisotropyMap', label: 'Anisotropy map' },
];

/** The channels that most scenes use, in the order a material row lists them. */
export const TEXTURE_SLOTS = TEXTURE_CHANNELS.slice(0, 9);

export function triangleCount(geometry: THREE.BufferGeometry): number {
  return Math.round((geometry.index ? geometry.index.count : (geometry.attributes.position?.count ?? 0)) / 3);
}

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(Boolean);
}

function channelTexture(material: THREE.Material, key: string): THREE.Texture | null {
  const value = (material as unknown as Record<string, unknown>)[key];
  return value instanceof THREE.Texture ? value : null;
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

    for (const material of materialsOf(mesh)) {
      const info = materials.get(material.uuid) ?? { material, users: [] };
      info.users.push(mesh);
      materials.set(material.uuid, info);
      for (const { key } of TEXTURE_CHANNELS) {
        const texture = channelTexture(material, key);
        if (texture) textures.set(texture.source.uuid, texture);
      }
    }
  });

  result.materials = [...materials.values()].sort((a, b) => b.users.length - a.users.length);
  result.textures = [...textures.values()];
  return result;
}

// ---- Textures -----------------------------------------------------------------------------------

export interface TextureUse {
  materialName: string;
  channel: string;
  mesh: THREE.Mesh;
}

export interface TextureEntry {
  /** The image source's id: two textures sharing one image are one entry. */
  id: string;
  name: string;
  texture: THREE.Texture;
  width: number;
  height: number;
  uses: TextureUse[];
  /** Compressed on the GPU (KTX2 / Basis): cannot be drawn to a canvas directly. */
  compressed: boolean;
  colorSpace: string;
  /** An estimate of GPU memory, including mipmaps. */
  bytes: number;
}

function textureSize(texture: THREE.Texture): { width: number; height: number } {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const mip = (texture as THREE.CompressedTexture).mipmaps?.[0] as { width?: number; height?: number } | undefined;
  return { width: image?.width ?? mip?.width ?? 0, height: image?.height ?? mip?.height ?? 0 };
}

function estimateBytes(texture: THREE.Texture, width: number, height: number): number {
  const compressed = (texture as THREE.CompressedTexture).isCompressedTexture === true;
  if (compressed) {
    const levels = (texture as THREE.CompressedTexture).mipmaps ?? [];
    return levels.reduce((n, level) => n + ((level as { data?: { byteLength?: number } }).data?.byteLength ?? 0), 0);
  }
  const base = width * height * 4;
  return texture.generateMipmaps || texture.mipmaps?.length ? Math.round(base * (4 / 3)) : base;
}

/** Every texture in the scene, once each, largest first, with where it is used. */
export function collectTextures(root: THREE.Object3D): TextureEntry[] {
  const found = new Map<string, TextureEntry>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of materialsOf(mesh)) {
      for (const { key } of TEXTURE_CHANNELS) {
        const texture = channelTexture(material, key);
        if (!texture) continue;
        let entry = found.get(texture.source.uuid);
        if (!entry) {
          const { width, height } = textureSize(texture);
          entry = {
            id: texture.source.uuid,
            name: texture.name || 'Unnamed texture',
            texture,
            width,
            height,
            uses: [],
            compressed: (texture as THREE.CompressedTexture).isCompressedTexture === true,
            colorSpace: texture.colorSpace || 'none',
            bytes: estimateBytes(texture, width, height),
          };
          found.set(texture.source.uuid, entry);
        }
        entry.uses.push({ materialName: material.name || 'Unnamed material', channel: key, mesh });
      }
    }
  });
  return [...found.values()].sort((a, b) => b.width * b.height - a.width * a.height);
}

// ---- Geometries ---------------------------------------------------------------------------------

export interface GeometryAttribute {
  name: string;
  itemSize: number;
  count: number;
}

export interface GeometryEntry {
  id: string;
  name: string;
  geometry: THREE.BufferGeometry;
  vertexCount: number;
  triangleCount: number;
  attributes: GeometryAttribute[];
  indexed: boolean;
  meshes: THREE.Mesh[];
  instanced: boolean;
}

/** Every geometry in the scene, once each, with the meshes that share it. Largest first. */
export function collectGeometries(root: THREE.Object3D): GeometryEntry[] {
  const found = new Map<string, GeometryEntry>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    let entry = found.get(geometry.uuid);
    if (!entry) {
      entry = {
        id: geometry.uuid,
        name: geometry.name || (mesh.name ? `${mesh.name} geometry` : 'Unnamed geometry'),
        geometry,
        vertexCount: geometry.attributes.position?.count ?? 0,
        triangleCount: triangleCount(geometry),
        attributes: Object.entries(geometry.attributes).map(([name, attribute]) => ({ name, itemSize: attribute.itemSize, count: attribute.count })),
        indexed: geometry.index !== null,
        meshes: [],
        instanced: (mesh as THREE.InstancedMesh).isInstancedMesh === true,
      };
      found.set(geometry.uuid, entry);
    }
    entry.meshes.push(mesh);
  });
  return [...found.values()].sort((a, b) => b.vertexCount - a.vertexCount);
}

/** The scene's vertices counted three ways, as glb-viewer-core's Info does. */
export function vertexStats(root: THREE.Object3D): { model: number; regular: number; instanced: number } {
  let model = 0;
  let regular = 0;
  let instanced = 0;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    const count = mesh.geometry?.attributes?.position?.count;
    if (!mesh.isMesh || count === undefined) return;
    model += count;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) instanced += count * (mesh as THREE.InstancedMesh).count;
    else regular += count;
  });
  return { model, regular, instanced };
}

// ---- Materials ----------------------------------------------------------------------------------

export interface MaterialRow {
  label: string;
  value: string;
  /** A colour to show as a swatch beside the value. */
  swatch?: string;
  /** For texture channels. */
  texture?: THREE.Texture;
}

export function colorHex(material: THREE.Material, key: 'color' | 'emissive' | 'specularColor'): string | null {
  const value = (material as unknown as Record<string, unknown>)[key];
  return value instanceof THREE.Color ? `#${value.getHexString()}` : null;
}

const number = (value: unknown, digits = 3): string => (typeof value === 'number' ? String(Number(value.toFixed(digits))) : '—');

/** The properties of a material, in the order the panel lists them. */
export function materialRows(material: THREE.Material): MaterialRow[] {
  const m = material as unknown as Record<string, unknown>;
  const rows: MaterialRow[] = [
    { label: 'Name', value: material.name || `(unnamed) ${material.uuid.slice(0, 8)}` },
    { label: 'Type', value: material.type },
    { label: 'Alpha mode', value: material.transparent ? 'Blend' : material.alphaTest > 0 ? 'Mask' : 'Opaque' },
  ];
  if (material.transparent) rows.push({ label: 'Opacity', value: number(material.opacity, 2) });
  rows.push({ label: 'Side', value: material.side === THREE.DoubleSide ? 'Double sided' : material.side === THREE.BackSide ? 'Back' : 'Front' });

  const color = colorHex(material, 'color');
  if (color) rows.push({ label: 'Color', value: color, swatch: color });
  const emissive = colorHex(material, 'emissive');
  if (emissive && emissive !== '#000000') {
    rows.push({ label: 'Emissive color', value: emissive, swatch: emissive });
    rows.push({ label: 'Emissive intensity', value: number(m.emissiveIntensity, 2) });
  }
  if (typeof m.metalness === 'number') rows.push({ label: 'Metalness', value: number(m.metalness, 2) });
  if (typeof m.roughness === 'number') rows.push({ label: 'Roughness', value: number(m.roughness, 2) });

  if ((material as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
    const p = material as THREE.MeshPhysicalMaterial;
    if (p.transmission > 0) rows.push({ label: 'Transmission', value: number(p.transmission, 2) });
    if (p.clearcoat > 0) rows.push({ label: 'Clearcoat', value: number(p.clearcoat, 2) });
    rows.push({ label: 'IOR', value: number(p.ior, 2) });
    rows.push({ label: 'Specular intensity', value: number(p.specularIntensity, 2) });
    const specular = colorHex(material, 'specularColor');
    if (specular) rows.push({ label: 'Specular color', value: specular, swatch: specular });
  }

  for (const { key, label } of TEXTURE_CHANNELS) {
    const texture = channelTexture(material, key);
    if (!texture) continue;
    const { width, height } = textureSize(texture);
    rows.push({ label, value: `${texture.name || 'Unnamed texture'}${width ? ` · ${width}×${height}` : ''}`, texture });
  }

  const extras = Object.keys(material.userData ?? {}).length;
  if (extras > 0) rows.push({ label: 'User data', value: JSON.stringify(material.userData) });
  return rows;
}

// ---- Nodes --------------------------------------------------------------------------------------

export function nodeType(node: THREE.Object3D): string {
  if ((node as THREE.InstancedMesh).isInstancedMesh) return 'Instanced mesh';
  if ((node as THREE.SkinnedMesh).isSkinnedMesh) return 'Skinned mesh';
  if ((node as THREE.Mesh).isMesh) return 'Mesh';
  if ((node as THREE.Bone).isBone) return 'Bone';
  if ((node as THREE.Light).isLight) return 'Light';
  if ((node as THREE.Camera).isCamera) return 'Camera';
  return 'Transform';
}
