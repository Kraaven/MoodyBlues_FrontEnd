import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { collectGeometries, collectTextures, inspectScene, materialRows, vertexStats } from './inspection';

function texture(name: string, width: number, height: number): THREE.Texture {
  const t = new THREE.Texture({ width, height } as unknown as HTMLImageElement);
  t.name = name;
  return t;
}

function mesh(name: string, geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[]): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  return m;
}

describe('collectTextures', () => {
  it('lists each image once, largest first, with every place it is used', () => {
    const big = texture('Wood', 1024, 1024);
    const small = texture('Dot', 16, 16);
    const wall = new THREE.MeshStandardMaterial({ name: 'Wall', map: big, normalMap: small });
    const floor = new THREE.MeshStandardMaterial({ name: 'Floor', map: big });
    const root = new THREE.Group();
    root.add(mesh('WallMesh', new THREE.BoxGeometry(), wall), mesh('FloorMesh', new THREE.BoxGeometry(), floor));

    const list = collectTextures(root);
    expect(list.map((t) => t.name)).toEqual(['Wood', 'Dot']);
    expect(list[0].uses.map((u) => `${u.mesh.name}:${u.channel}`).sort()).toEqual(['FloorMesh:map', 'WallMesh:map']);
    expect(list[1].uses).toHaveLength(1);
  });

  it('treats two textures that share an image as one', () => {
    const a = texture('A', 64, 64);
    const b = texture('B', 64, 64);
    b.source = a.source;
    const root = new THREE.Group();
    root.add(mesh('One', new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: a })), mesh('Two', new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: b })));
    expect(collectTextures(root)).toHaveLength(1);
  });

  it('estimates memory with mipmaps', () => {
    const t = texture('T', 100, 100);
    t.generateMipmaps = true;
    const root = new THREE.Group();
    root.add(mesh('M', new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: t })));
    expect(collectTextures(root)[0].bytes).toBe(Math.round(100 * 100 * 4 * (4 / 3)));
  });

  it('copes with a scene that has no textures', () => {
    const root = new THREE.Group();
    root.add(mesh('Plain', new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    expect(collectTextures(root)).toEqual([]);
  });
});

describe('collectGeometries', () => {
  it('lists a shared geometry once, with all its meshes and its attributes', () => {
    const shared = new THREE.BoxGeometry();
    const root = new THREE.Group();
    root.add(mesh('A', shared, new THREE.MeshBasicMaterial()), mesh('B', shared, new THREE.MeshBasicMaterial()), mesh('C', new THREE.SphereGeometry(1, 8, 8), new THREE.MeshBasicMaterial()));
    const list = collectGeometries(root);
    expect(list).toHaveLength(2);
    const box = list.find((g) => g.geometry === shared)!;
    expect(box.meshes.map((m) => m.name)).toEqual(['A', 'B']);
    expect(box.attributes.map((a) => a.name)).toEqual(expect.arrayContaining(['position', 'normal', 'uv']));
    expect(box.indexed).toBe(true);
  });

  it('orders by vertex count, most first', () => {
    const root = new THREE.Group();
    root.add(mesh('Small', new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()), mesh('Big', new THREE.SphereGeometry(1, 32, 32), new THREE.MeshBasicMaterial()));
    const list = collectGeometries(root);
    expect(list[0].vertexCount).toBeGreaterThan(list[1].vertexCount);
  });
});

describe('vertexStats', () => {
  it('counts model, regular and instanced vertices separately', () => {
    const box = new THREE.BoxGeometry();
    const perBox = box.attributes.position.count;
    const root = new THREE.Group();
    root.add(mesh('Plain', box, new THREE.MeshBasicMaterial()));
    root.add(new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial(), 10));
    const stats = vertexStats(root);
    expect(stats.regular).toBe(perBox);
    expect(stats.instanced).toBe(perBox * 10);
    expect(stats.model).toBe(perBox * 2);
  });
});

describe('materialRows', () => {
  it('describes a standard material, with a swatch for colour and its textures', () => {
    const rows = materialRows(new THREE.MeshStandardMaterial({ name: 'Brick', color: 0xff0000, roughness: 0.4, metalness: 0.1, map: texture('BrickTex', 256, 128) }));
    const by = (label: string) => rows.find((r) => r.label === label);
    expect(by('Name')?.value).toBe('Brick');
    expect(by('Color')?.swatch).toBe('#ff0000');
    expect(by('Roughness')?.value).toBe('0.4');
    expect(by('Base color map')?.value).toContain('256×128');
    expect(by('Base color map')?.texture).toBeDefined();
  });

  it('labels the roughness map correctly (glb-viewer-core labels it "Metalness map")', () => {
    const rows = materialRows(new THREE.MeshStandardMaterial({ roughnessMap: texture('R', 8, 8) }));
    expect(rows.some((r) => r.label === 'Roughness map')).toBe(true);
    expect(rows.some((r) => r.label === 'Metalness map')).toBe(false);
  });

  it('adds the physical properties only for a physical material', () => {
    const physical = materialRows(new THREE.MeshPhysicalMaterial({ transmission: 0.5, ior: 1.4 }));
    expect(physical.some((r) => r.label === 'Transmission')).toBe(true);
    expect(physical.some((r) => r.label === 'IOR')).toBe(true);
    expect(materialRows(new THREE.MeshStandardMaterial()).some((r) => r.label === 'IOR')).toBe(false);
  });

  it('shows opacity only when the material is transparent', () => {
    expect(materialRows(new THREE.MeshStandardMaterial()).some((r) => r.label === 'Opacity')).toBe(false);
    expect(materialRows(new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.5 })).find((r) => r.label === 'Opacity')?.value).toBe('0.5');
  });
});

describe('inspectScene', () => {
  it('counts tracked, hidden and mesh nodes, and merges materials by use', () => {
    const shared = new THREE.MeshBasicMaterial({ name: 'Shared' });
    const root = new THREE.Group();
    const a = mesh('A', new THREE.BoxGeometry(), shared);
    a.userData.objectId = 1;
    const b = mesh('B', new THREE.BoxGeometry(), shared);
    b.userData.isHidden = true;
    root.add(a, b);
    const result = inspectScene(root);
    expect(result.meshCount).toBe(2);
    expect(result.trackedCount).toBe(1);
    expect(result.hiddenCount).toBe(1);
    expect(result.materials).toHaveLength(1);
    expect(result.materials[0].users).toHaveLength(2);
  });
});
