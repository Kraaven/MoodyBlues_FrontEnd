import * as THREE from 'three';
import type { MixedMode } from './sceneExtension';
import type { Look } from './look';

/**
 * The game look's rules for the scene's own lights (contract section 3), as pure functions over
 * three.js objects. The exporter writes a light's bake mode (`extras.lightBake`) on the node that
 * carries the Light; three.js puts a glTF light under that node, so it is read from the light or its parent.
 */
export type LightBake = 'realtime' | 'mixed' | 'baked';

/** A light's bake mode; a light that does not say is realtime. */
export function lightBakeOf(light: THREE.Object3D): LightBake {
  for (const holder of [light, light.parent]) {
    const bake = holder?.userData?.lightBake;
    if (bake === 'baked' || bake === 'mixed' || bake === 'realtime') return bake;
  }
  return 'realtime';
}

/**
 * Whether a light of the scene is switched on. `on` is the user's "scene lights" setting. A light the
 * scene marked inactive stays off, and in the game look a baked light stays off because its light is
 * already in the lightmaps.
 */
export function lightEnabled(light: THREE.Object3D, on: boolean, look: Look): boolean {
  if (!on || light.userData?.isHidden === true) return false;
  return !(look === 'game' && lightBakeOf(light) === 'baked');
}

/** What the skip rule needs to know about a directional light. */
export interface DirectionalInfo {
  bake: LightBake;
}

/**
 * Whether lightmapped surfaces skip every directional light: when there is at least one and each is
 * `baked`, or `mixed` in a scene whose mixed lighting mode is Subtractive (the lightmap then already
 * holds that light and its shadows). Any realtime directional light, or a mixed one under another
 * mode, means the lightmap does not hold all of it, so directional lights are kept.
 */
export function skipDirectionalOnLightmapped(directional: readonly DirectionalInfo[], mixedMode: MixedMode | null): boolean {
  if (directional.length === 0) return false;
  return directional.every((d) => d.bake === 'baked' || (d.bake === 'mixed' && mixedMode === 'subtractive'));
}

/** The directional lights under `root` (visible or not), for {@link skipDirectionalOnLightmapped}. */
export function directionalLightsOf(root: THREE.Object3D): DirectionalInfo[] {
  const found: DirectionalInfo[] = [];
  root.traverse((node) => {
    if ((node as THREE.DirectionalLight).isDirectionalLight) found.push({ bake: lightBakeOf(node) });
  });
  return found;
}

/** The node with this ObjectID, or null. */
export function findByObjectId(root: THREE.Object3D, id: number): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((node) => {
    if (!found && node.userData?.objectId === id) found = node;
  });
  return found;
}

/** The sun: the scene's sun node's directional light, if the node has one that is not baked. */
export function findSunLight(root: THREE.Object3D, sunId: number | null): THREE.DirectionalLight | null {
  if (sunId === null) return null;
  const node = findByObjectId(root, sunId);
  if (!node) return null;
  let light: THREE.DirectionalLight | null = null;
  node.traverse((n) => {
    if (!light && (n as THREE.DirectionalLight).isDirectionalLight) light = n as THREE.DirectionalLight;
  });
  return light;
}

const forward = new THREE.Vector3();

/** The direction light travels from a node (its world -Z, glTF space), unit length. Writes into `out`. */
export function lookDirection(node: THREE.Object3D, out = new THREE.Vector3()): THREE.Vector3 {
  node.updateWorldMatrix(true, false);
  node.getWorldDirection(forward);
  return out.copy(forward).negate();
}

/**
 * The direction TOWARDS the sun from a point on the ground: the opposite of the way its light
 * travels, which is the node's world -Z.
 */
export function towardsSun(sunNode: THREE.Object3D, out = new THREE.Vector3()): THREE.Vector3 {
  return lookDirection(sunNode, out).negate();
}
