// A small scene GLB for the dev mock: a nested hierarchy with the `extras.objectId` the viewer
// binds to. Ids match dev/mock/fixture.ts.
//
//   1 Arena
//     2 Floor   3 Crate_A (circles)   4 Crate_B (slides)   5 Crate_C (spins)
//   6 PrefabLibrary
//     7 Beacon_Template (inactive; object 8 is spawned from it)

function unitCube() {
  const faces = [
    [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
    [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
    [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
    [[0, 0, 1], [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]]],
    [[0, 0, -1], [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]],
  ];
  const pos = [];
  const nor = [];
  const idx = [];
  faces.forEach(([n, vs], f) => {
    vs.forEach((v) => {
      pos.push(v[0] * 0.5, v[1] * 0.5, v[2] * 0.5);
      nor.push(...n);
    });
    const b = f * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return { pos, nor, idx };
}

export function makeGlb() {
  const cube = unitCube();
  const chunks = [];
  const views = [];
  let offset = 0;
  const push = (data, Type, target) => {
    const bytes = Buffer.from(new Type(data).buffer);
    const pad = (4 - (bytes.length % 4)) % 4;
    chunks.push(bytes, Buffer.alloc(pad));
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    offset += bytes.length + pad;
    return views.length - 1;
  };
  const pv = push(cube.pos, Float32Array, 34962);
  const nv = push(cube.nor, Float32Array, 34962);
  const iv = push(cube.idx, Uint16Array, 34963);
  const accessors = [
    { bufferView: pv, componentType: 5126, count: 24, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
    { bufferView: nv, componentType: 5126, count: 24, type: 'VEC3' },
    { bufferView: iv, componentType: 5123, count: 36, type: 'SCALAR' },
  ];

  const colors = [
    [0.11, 0.14, 0.25, 1], // floor
    [0.35, 0.5, 1, 1], // crate A
    [0.93, 0.55, 0.32, 1], // crate B
    [0.42, 0.85, 0.62, 1], // crate C
    [0.85, 0.85, 0.95, 1], // beacon
  ];
  const materials = colors.map((c) => ({ pbrMetallicRoughness: { baseColorFactor: c, metallicFactor: 0.1, roughnessFactor: 0.65 } }));
  const meshes = colors.map((_, i) => ({ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: i }] }));

  const nodes = [
    { name: 'Arena', children: [1, 2, 3, 4], extras: { objectId: 1 } },
    { name: 'Floor', mesh: 0, scale: [10, 0.2, 10], translation: [0, -0.1, 0], extras: { objectId: 2 } },
    { name: 'Crate_A', mesh: 1, translation: [2.5, 0.6, 0], extras: { objectId: 3 } },
    { name: 'Crate_B', mesh: 2, scale: [1.4, 0.9, 1.4], translation: [-3, 0.5, 1.5], extras: { objectId: 4 } },
    { name: 'Crate_C', mesh: 3, scale: [1, 1.6, 1], translation: [0, 0.8, -3], extras: { objectId: 5 } },
    { name: 'PrefabLibrary', children: [6], extras: { objectId: 6 } },
    { name: 'Beacon_Template', mesh: 4, scale: [0.5, 1.2, 0.5], extras: { objectId: 7, isHidden: true } },
  ];

  const bin = Buffer.concat(chunks);
  const json = {
    asset: { version: '2.0', generator: 'moodyblues-dev-mock' },
    scene: 0,
    scenes: [{ nodes: [0, 5] }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: bin.length }],
  };
  let jsonBytes = Buffer.from(JSON.stringify(json));
  jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(jsonBytes.length, 0);
  jsonHead.writeUInt32LE(0x4e4f534a, 4);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(bin.length, 0);
  binHead.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHead, jsonBytes, binHead, bin]);
}
