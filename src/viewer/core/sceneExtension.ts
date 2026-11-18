/**
 * The `MOODYBLUES_scene` glTF root extension: what the Unity game's lighting looked like, written by
 * the Unity exporter and kept by the backend's optimizer. This module only READS it, as plain data
 * with no three.js in it, so the parser and the ambient-cube maths are testable alone. Every colour is
 * linear RGB. Nothing in the extension is trusted: a member that is missing or malformed takes a
 * default, and `parseSceneExtension` never throws. The contract lives in the repo notes
 * (`game-look-contract.md`, sections 1 to 3).
 */

export type RGB = [number, number, number];

export const EXTENSION_NAME = 'MOODYBLUES_scene';

export type FogMode = 'linear' | 'exp' | 'exp2';
export type MixedMode = 'subtractive' | 'shadowmask' | 'indirect';

export interface SceneFog {
  mode: FogMode;
  color: RGB;
  /** For `exp` and `exp2`. */
  density: number;
  /** For `linear`, in metres. */
  start: number;
  end: number;
}

export type SceneSky =
  | { type: 'procedural'; skyTint: RGB; groundColor: RGB; exposure: number; sunSize: number; sunSizeConvergence: number; atmosphereThickness: number }
  | { type: 'color'; color: RGB }
  | { type: 'other' };

export interface ScenePost {
  tonemapping: 'none' | 'neutral' | 'aces';
  /** Exposure in stops (EV). */
  postExposure: number;
}

export interface SceneLightmap {
  /** A glTF texture index. */
  texture: number;
  /** Decode: rgb * a * range. */
  range: number;
}

export interface MoodyScene {
  /** Ambient diffuse light by axis: +X, -X, +Y, -Y, +Z, -Z, in glTF space. */
  ambientCube: RGB[];
  fog: SceneFog | null;
  sky: SceneSky;
  /** ObjectID of the node whose world -Z is the sun's direction. */
  sun: number | null;
  mixedMode: MixedMode | null;
  post: ScenePost | null;
  /** By Unity lightmap index; an entry that could not be read is null. */
  lightmaps: (SceneLightmap | null)[];
}

/** The ambient a scene without one gets: a dim neutral, so unlit-by-sky surfaces are not black. */
const FALLBACK_AMBIENT: RGB = [0.2, 0.2, 0.2];

type Json = Record<string, unknown>;

function record(value: unknown): Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A linear colour of three finite numbers, or null. Components are kept non-negative. */
function rgb(value: unknown): RGB | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const [r, g, b] = value as unknown[];
  if (![r, g, b].every((c) => typeof c === 'number' && Number.isFinite(c))) return null;
  return [Math.max(0, r as number), Math.max(0, g as number), Math.max(0, b as number)];
}

function readCube(value: unknown): RGB[] {
  const cube = Array.isArray(value) ? value.map(rgb) : [];
  if (cube.length !== 6 || cube.some((c) => c === null)) return Array.from({ length: 6 }, () => [...FALLBACK_AMBIENT] as RGB);
  return cube as RGB[];
}

function readFog(value: unknown): SceneFog | null {
  const r = record(value);
  if (r.mode !== 'linear' && r.mode !== 'exp' && r.mode !== 'exp2') return null;
  const color = rgb(r.color);
  if (!color) return null;
  return { mode: r.mode, color, density: Math.max(0, num(r.density, 0.01)), start: Math.max(0, num(r.start, 0)), end: Math.max(0, num(r.end, 300)) };
}

function readSky(value: unknown): SceneSky {
  const r = record(value);
  if (r.type === 'procedural') {
    return {
      type: 'procedural',
      skyTint: rgb(r.skyTint) ?? [0.5, 0.5, 0.5],
      groundColor: rgb(r.groundColor) ?? [0.4, 0.4, 0.4],
      exposure: Math.max(0, num(r.exposure, 1.3)),
      sunSize: Math.max(0, num(r.sunSize, 0.04)),
      sunSizeConvergence: Math.max(1, num(r.sunSizeConvergence, 5)),
      atmosphereThickness: Math.max(0, num(r.atmosphereThickness, 1)),
    };
  }
  if (r.type === 'color') {
    const color = rgb(r.color);
    if (color) return { type: 'color', color };
  }
  return { type: 'other' };
}

function readPost(value: unknown): ScenePost | null {
  const r = record(value);
  if (Object.keys(r).length === 0) return null;
  const mode = r.tonemapping;
  return { tonemapping: mode === 'neutral' || mode === 'aces' ? mode : 'none', postExposure: num(r.postExposure, 0) };
}

function readLightmaps(value: unknown): (SceneLightmap | null)[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const r = record(entry);
    const texture = r.texture;
    if (typeof texture !== 'number' || !Number.isInteger(texture) || texture < 0) return null;
    // Only RGBM exists in version 1; an entry that says otherwise cannot be decoded.
    if (r.encoding !== undefined && r.encoding !== 'rgbm') return null;
    const range = num(r.range, 8);
    return { texture, range: range > 0 ? range : 8 };
  });
}

/**
 * The extension object from the glTF root (`json.extensions.MOODYBLUES_scene`), or null when there is
 * none or it is not a version this viewer knows. Never throws.
 */
export function parseSceneExtension(raw: unknown): MoodyScene | null {
  try {
    const r = record(raw);
    if (r.version !== 1) return null;
    const mixed = record(r.lighting).mixedMode;
    const sun = r.sun;
    return {
      ambientCube: readCube(record(r.ambient).cube),
      fog: readFog(r.fog),
      sky: readSky(r.sky),
      sun: typeof sun === 'number' && Number.isInteger(sun) ? sun : null,
      mixedMode: mixed === 'subtractive' || mixed === 'shadowmask' || mixed === 'indirect' ? mixed : null,
      post: readPost(r.post),
      lightmaps: readLightmaps(r.lightmaps),
    };
  } catch {
    return null;
  }
}

/** The extension out of a parsed glTF's root `extensions`. */
export function sceneExtensionOf(json: unknown): MoodyScene | null {
  return parseSceneExtension(record(record(json).extensions)[EXTENSION_NAME]);
}

/**
 * The ambient light for a surface whose world normal (glTF space) is `n`: Valve's "ambient cube",
 * which the fragment shader mirrors. Each axis contributes in proportion to the square of the normal
 * component, taking the face on the side the normal points to.
 */
export function evaluateAmbientCube(cube: readonly RGB[], n: readonly [number, number, number]): RGB {
  const xx = n[0] * n[0];
  const yy = n[1] * n[1];
  const zz = n[2] * n[2];
  const x = cube[n[0] >= 0 ? 0 : 1];
  const y = cube[n[1] >= 0 ? 2 : 3];
  const z = cube[n[2] >= 0 ? 4 : 5];
  return [xx * x[0] + yy * y[0] + zz * z[0], xx * x[1] + yy * y[1] + zz * z[1], xx * x[2] + yy * y[2] + zz * z[2]];
}

/** What a node's `extras.lightmap` says. */
export interface NodeLightmap {
  index: number;
  /** [sx, sy, ox, oy] in glTF UV space. */
  scaleOffset: [number, number, number, number];
}

/** A node's `extras.lightmap`, or null when it is absent or malformed. */
export function readNodeLightmap(raw: unknown): NodeLightmap | null {
  const r = record(raw);
  const index = r.index;
  const so = r.scaleOffset;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null;
  if (!Array.isArray(so) || so.length < 4 || !so.slice(0, 4).every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
  return { index, scaleOffset: [so[0] as number, so[1] as number, so[2] as number, so[3] as number] };
}
