// A small scene GLB for the dev mock: a nested hierarchy with the `extras.objectId` the viewer
// binds to. Ids match dev/mock/fixture.ts.
//
//   1 Arena
//     2 Floor   3 Crate_A (circles)   4 Crate_B (slides)   5 Crate_C (spins)
//   6 PrefabLibrary
//     7 Beacon_Template (inactive; object 8 is spawned from it)

import zlib from 'node:zlib';

// A 32x32 colour checker as a PNG, so the inspector has a real image texture to show.
function checkerPng() {
  const size = 32;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const on = ((x >> 3) + (y >> 3)) % 2 === 0;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = on ? 255 : 40;
      raw[o + 1] = on ? 181 : 70;
      raw[o + 2] = on ? 71 : 160;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

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
  const uv = [];
  const idx = [];
  faces.forEach(([n, vs], f) => {
    vs.forEach((v, k) => {
      uv.push(k === 0 || k === 3 ? 0 : 1, k < 2 ? 1 : 0);
      pos.push(v[0] * 0.5, v[1] * 0.5, v[2] * 0.5);
      nor.push(...n);
    });
    const b = f * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return { pos, nor, uv, idx };
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
  const uvv = push(cube.uv, Float32Array, 34962);
  const iv = push(cube.idx, Uint16Array, 34963);
  const png = checkerPng();
  const imageView = push(png, Uint8Array);
  const accessors = [
    { bufferView: pv, componentType: 5126, count: 24, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
    { bufferView: nv, componentType: 5126, count: 24, type: 'VEC3' },
    { bufferView: iv, componentType: 5123, count: 36, type: 'SCALAR' },
    { bufferView: uvv, componentType: 5126, count: 24, type: 'VEC2' },
  ];

  const colors = [
    [0.11, 0.14, 0.25, 1], // floor
    [0.35, 0.5, 1, 1], // crate A
    [0.93, 0.55, 0.32, 1], // crate B
    [0.42, 0.85, 0.62, 1], // crate C
    [0.85, 0.85, 0.95, 1], // beacon
  ];
  const textured = new Set([0, 3]);
  const materials = colors.map((c, i) => ({
    name: ['FloorMat', 'CrateBlue', 'CrateOrange', 'CrateGreen', 'BeaconMat'][i],
    pbrMetallicRoughness: { baseColorFactor: c, metallicFactor: 0.1, roughnessFactor: 0.65, ...(textured.has(i) ? { baseColorTexture: { index: 0 } } : {}) },
  }));
  const meshes = colors.map((_, i) => ({ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 3 }, indices: 2, material: i }] }));

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
    textures: [{ source: 0, name: 'Checker' }],
    images: [{ bufferView: imageView, mimeType: 'image/png', name: 'Checker' }],
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
