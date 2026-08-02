import * as THREE from 'three';
import type { AnimationData } from '../../lib/types';
import { resolveLifecycle, buildChannelEntries, sampleObjectTransformScratch, type ChannelEntry } from './animationSampling';

type ObjectMap = Map<number, THREE.Object3D>;

export function buildObjectMap(scene: THREE.Object3D): ObjectMap {
  const map: ObjectMap = new Map();
  scene.traverse((node) => {
    if (node.userData && typeof node.userData.objectId === 'number') {
      map.set(node.userData.objectId, node);
    }
  });
  return map;
}

const _ON_VEC = new THREE.Vector3(1, 1, 1);
const _sampleQuat = new THREE.Quaternion();

type ObjData = AnimationData['objects'][number];

export class SessionAnimationDriver {
  readonly animation: AnimationData;
  readonly objectMap: ObjectMap;
  readonly scene: THREE.Object3D;

  // Fixed-size buffers: one 3-float / 4-float slot per baseline-eligible object, indexed via
  // _baselineIndex. No per-object heap objects, no per-frame allocation.
  private _baselinePos!: Float32Array;
  private _baselineRot!: Float32Array;
  private _baselineScl!: Float32Array;
  private _baselineIndex = new Map<number, number>();

  private _spawnedClones = new Map<number, THREE.Object3D>();
  private _objectsById = new Map<number, ObjData>();
  private _channelsById = new Map<number, ChannelEntry[]>();
  private _currentTime = 0;
  private _playing = true;

  constructor(scene: THREE.Object3D, animation: AnimationData) {
    this.scene = scene;
    this.animation = animation;
    this.objectMap = buildObjectMap(scene);

    const baselineCandidates: { objectId: number; node: THREE.Object3D }[] = [];

    for (const obj of animation.objects) {
      this._objectsById.set(obj.objectId, obj);
      this._channelsById.set(obj.objectId, buildChannelEntries(obj));

      if (obj.templateObjectId !== null) {
        const template = this.objectMap.get(obj.templateObjectId);
        if (template) template.visible = false;
        continue;
      }

      const node = this.objectMap.get(obj.objectId);
      if (!node) continue;
      baselineCandidates.push({ objectId: obj.objectId, node });
    }

    this._baselinePos = new Float32Array(baselineCandidates.length * 3);
    this._baselineRot = new Float32Array(baselineCandidates.length * 4);
    this._baselineScl = new Float32Array(baselineCandidates.length * 3);

    baselineCandidates.forEach(({ objectId, node }, i) => {
      this._baselineIndex.set(objectId, i);
      this._baselinePos.set([node.position.x, node.position.y, node.position.z], i * 3);
      this._baselineRot.set([node.quaternion.x, node.quaternion.y, node.quaternion.z, node.quaternion.w], i * 4);
      this._baselineScl.set([node.scale.x, node.scale.y, node.scale.z], i * 3);
    });

    this.seekTo(0);
  }

  get currentTime(): number { return this._currentTime; }
  get duration(): number { return this.animation.durationSeconds; }
  get playing(): boolean { return this._playing; }
  set playing(value: boolean) { this._playing = value; }

  update(rawDelta: number): void {
    if (!this._playing) return;
    const delta = Math.min(rawDelta, 1.0);
    this._currentTime = Math.min(this._currentTime + delta, this.animation.durationSeconds);
    this._apply(this._currentTime);
  }

  seekTo(time: number): void {
    this._currentTime = Math.max(0, Math.min(time, this.animation.durationSeconds));
    this._rebuildState(this._currentTime);
  }

  dispose(): void {
    for (const clone of this._spawnedClones.values()) this.scene.remove(clone);
    this._spawnedClones.clear();
    this._playing = false;
  }

  private _apply(time: number): void {
    // Reparent FIRST, so anything created earlier gets attached to its real parent before we
    // compute this frame's local transform for it -- avoids the "one frame under the wrong
    // parent" pop on spawn.
    this._reparentSpawned();

    for (const obj of this.animation.objects) {
      const defaultAlive = obj.templateObjectId === null;
      const { visible, alive } = resolveLifecycle(obj.lifecycle, time, defaultAlive);

      if (!alive) {
        const existing = this.objectMap.get(obj.objectId);
        if (existing) existing.visible = false;
        continue;
      }

      const node = this._resolveNode(obj);
      if (!node) continue;

      node.visible = visible;
      if (visible) this._applyTransform(obj, node, time);
    }
  }

  private _rebuildState(time: number): void {
    for (const clone of this._spawnedClones.values()) this.scene.remove(clone);
    for (const id of this._spawnedClones.keys()) this.objectMap.delete(id);
    this._spawnedClones.clear();
    this._apply(time);
  }

  private _reparentSpawned(): void {
    for (const [objectId, clone] of this._spawnedClones) {
      const obj = this._objectsById.get(objectId);
      if (!obj) continue;

      const parentId = obj.parentObjectId;
      if (parentId == null || parentId === 0) continue;

      const parent = this.objectMap.get(parentId);
      if (parent && clone.parent !== parent) {
        parent.add(clone); // preserves clone's local TRS -- correct since samples are local
      }
    }
  }

  private _applyTransform(obj: ObjData, node: THREE.Object3D, time: number): void {
    const entries = this._channelsById.get(obj.objectId);
    const sample = entries ? sampleObjectTransformScratch(entries, time) : null;
    if (!sample) return;

    const baseIdx = this._baselineIndex.get(obj.objectId);
    if (baseIdx === undefined) {
      node.position.copy(sample.position);
      node.quaternion.copy(sample.rotation);
      node.scale.copy(sample.scale);
      return;
    }

    const bp = this._baselinePos, br = this._baselineRot, bs = this._baselineScl;
    const pi = baseIdx * 3, ri = baseIdx * 4, si = baseIdx * 3;

    node.position.set(sample.position.x + bp[pi], sample.position.y + bp[pi + 1], sample.position.z + bp[pi + 2]);

    _sampleQuat.set(br[ri], br[ri + 1], br[ri + 2], br[ri + 3]); // baseline rotation
    node.quaternion.copy(_sampleQuat).multiply(sample.rotation);  // baseline * sample

    node.scale.set(
      sample.scale.x + bs[si] - 1,
      sample.scale.y + bs[si + 1] - 1,
      sample.scale.z + bs[si + 2] - 1,
    );
  }

  private _resolveNode(obj: ObjData): THREE.Object3D | null {
    if (this.objectMap.has(obj.objectId)) return this.objectMap.get(obj.objectId)!;

    if (obj.templateObjectId !== null) {
      const template = this.objectMap.get(obj.templateObjectId);
      if (!template) return null;

      const clone = template.clone(true);
      template.visible = false;
      this.objectMap.set(obj.objectId, clone);
      this._spawnedClones.set(obj.objectId, clone);
      if (clone.userData) clone.userData.objectId = obj.objectId;

      // Attach to its real parent immediately if it's already resolvable, so we never even
      // hit the one-frame-under-root case in the common (parent-already-exists) path.
      const parentId = obj.parentObjectId;
      const parent = parentId != null && parentId !== 0 ? this.objectMap.get(parentId) : null;
      (parent ?? this.scene).add(clone);

      return clone;
    }

    return null;
  }
}