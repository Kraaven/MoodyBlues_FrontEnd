import * as THREE from 'three';
import type { AnimationData } from '../../lib/types';
import { resolveLifecycle, sampleObjectTransform } from './animationSampling';

type ObjectMap = Map<number, THREE.Object3D>;

/** Builds an ObjectID → Object3D lookup from userData.objectId (set by ObjectIdExportPlugin in Unity). */
export function buildObjectMap(scene: THREE.Object3D): ObjectMap {
  const map: ObjectMap = new Map();
  scene.traverse((node) => {
    if (node.userData && typeof node.userData.objectId === 'number') {
      map.set(node.userData.objectId, node);
    }
  });
  return map;
}

/**
 * Drives per-frame animation for a Session recording, mutating Object3D transforms directly
 * inside a `useFrame` loop. Not using AnimationMixer -- session channels are independent
 * per-object TRS data, not pre-baked AnimationClips.
 *
 * Usage in a R3F component:
 *   const driver = useMemo(() => new SessionAnimationDriver(scene, animation), [scene, animation]);
 *   useFrame((_, delta) => driver.update(delta));
 *   // Seeking: driver.seekTo(targetTime);
 *   // Cleanup: driver.dispose();
 */
const _ON_VEC = new THREE.Vector3(1, 1, 1);

type Baseline = { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 };

export class SessionAnimationDriver {
  readonly animation: AnimationData;
  readonly objectMap: ObjectMap;
  readonly scene: THREE.Object3D;

  /** GLB-baked starting TRS for scene objects (no template!). Server accumulates from
   *  (0,0,0)/Identity/(1,1,1) defaults, so we offset every sample by this baseline.
   *  Spawned objects get correct absolute positions via InstantiateObjectEvent True events,
   *  so they skip the correction. */
  private _baselines = new Map<number, Baseline>();

  /** Clones created for runtime-spawned objects (ObjectID → clone), for cleanup. */
  private _spawnedClones = new Map<number, THREE.Object3D>();
  private _currentTime = 0;
  private _playing = true;

  constructor(scene: THREE.Object3D, animation: AnimationData) {
    this.scene = scene;
    this.animation = animation;
    this.objectMap = buildObjectMap(scene);

    for (const obj of animation.objects) {
      if (obj.templateObjectId !== null) {
        const template = this.objectMap.get(obj.templateObjectId);
        if (template) template.visible = false;
        continue;
      }

      const node = this.objectMap.get(obj.objectId);
      if (!node) continue;

      this._baselines.set(obj.objectId, {
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
      });
    }

    this.seekTo(0);
  }

  get currentTime(): number { return this._currentTime; }
  get duration(): number { return this.animation.durationSeconds; }

  get playing(): boolean { return this._playing; }
  set playing(value: boolean) { this._playing = value; }

  /** Called every frame. `rawDelta` is the wall-clock delta from useFrame's state. */
  update(rawDelta: number): void {
    if (!this._playing) return;

    // Clamp delta so a single huge-frame hitch (browser tab was backgrounded) doesn't
    // jump over lifecycle events; a 1s cap still catches up quickly but never skips
    // spawn/delete boundaries entirely.
    const delta = Math.min(rawDelta, 1.0);
    this._currentTime = Math.min(this._currentTime + delta, this.animation.durationSeconds);
    this._apply(this._currentTime);
  }

  /** Scrubs to an exact time, replaying lifecycle events to rebuild visibility/clones correctly. */
  seekTo(time: number): void {
    this._currentTime = Math.max(0, Math.min(time, this.animation.durationSeconds));
    this._rebuildState(this._currentTime);
  }

  /** Tears down all spawned clones and stops playback. Call when unmounting. */
  dispose(): void {
    for (const clone of this._spawnedClones.values()) {
      this.scene.remove(clone);
    }
    this._spawnedClones.clear();
    this._playing = false;
  }

  // ---- internals ----

  private _apply(time: number): void {
    for (const obj of this.animation.objects) {
      const node = this._resolveNode(obj);
      if (!node) continue;

      const { visible, alive } = resolveLifecycle(obj.lifecycle, time);
      if (!alive) continue;

      node.visible = visible;
      if (visible) {
        this._applyTransform(obj, node, time);
      }
    }
  }

  /** Rebuilds state from T=0 to `time` to handle seeking (spawns, deletes, visibility). */
  private _rebuildState(time: number): void {
    for (const clone of this._spawnedClones.values()) {
      this.scene.remove(clone);
    }
    for (const id of this._spawnedClones.keys()) {
      this.objectMap.delete(id);
    }
    this._spawnedClones.clear();

    for (const obj of this.animation.objects) {
      const { alive, visible } = resolveLifecycle(obj.lifecycle, time);

      if (!alive) continue;

      const node = this._resolveNode(obj);
      if (!node) continue;

      node.visible = visible;
      if (visible) {
        this._applyTransform(obj, node, time);
      }
    }
  }

  private _applyTransform(obj: AnimationData['objects'][number], node: THREE.Object3D, time: number): void {
    sampleObjectTransform(obj, node, time);

    const baseline = this._baselines.get(obj.objectId);
    if (!baseline) return;

    node.position.add(baseline.position);
    node.quaternion.premultiply(baseline.quaternion);
    node.scale.add(baseline.scale).sub(_ON_VEC);

    // Three.js Object3D.scale.add(baseline.scale) may be incorrect because scale is not a
    // Vector3 in newer versions; the runtime still supports it but the type may not reflect it.
  }

  private _resolveNode(obj: { objectId: number; templateObjectId: number | null }): THREE.Object3D | null {
    if (this.objectMap.has(obj.objectId)) {
      return this.objectMap.get(obj.objectId)!;
    }

    if (obj.templateObjectId !== null) {
      const template = this.objectMap.get(obj.templateObjectId);
      if (!template) return null;

      const clone = template.clone(true);
      template.visible = false;
      this.scene.add(clone);
      this.objectMap.set(obj.objectId, clone);
      this._spawnedClones.set(obj.objectId, clone);

      if (clone.userData && typeof obj.objectId === 'number') {
        clone.userData.objectId = obj.objectId;
      }

      return clone;
    }

    return null;
  }
}