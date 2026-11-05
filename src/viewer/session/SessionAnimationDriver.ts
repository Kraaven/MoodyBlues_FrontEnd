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

const _samplePos = new THREE.Vector3();
const _sampleRot = new THREE.Quaternion();
const _sampleScl = new THREE.Vector3();

type ObjData = AnimationData['objects'][number];

function objectKey(obj: ObjData): number {
  return obj.objectId;
}

function channelKey(obj: ObjData): string {
  return `${obj.objectId}:${obj.instanceIndex ?? 0}`;
}

export class SessionAnimationDriver {
  readonly animation: AnimationData;
  readonly objectMap: ObjectMap;
  readonly scene: THREE.Object3D;

  private _spawnedClones = new Map<number, THREE.Object3D>();
  private _objectsById = new Map<string, ObjData>();
  private _channelsById = new Map<string, ChannelEntry[]>();
  private _currentTime = 0;
  private _playing = true;

  constructor(scene: THREE.Object3D, animation: AnimationData) {
    this.scene = scene;
    this.animation = animation;
    this.objectMap = buildObjectMap(scene);

    for (const obj of animation.objects) {
      this._objectsById.set(channelKey(obj), obj);
      this._channelsById.set(channelKey(obj), buildChannelEntries(obj));

      if (obj.templateObjectId !== null) {
        const template = this.objectMap.get(obj.templateObjectId);
        if (template) template.visible = false;
      }
    }

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
    this._reparentSpawned();

    for (const obj of this.animation.objects) {
      const defaultAlive = obj.templateObjectId === null;
      const { visible, alive } = resolveLifecycle(obj.lifecycle, time, defaultAlive);

      if (!alive) {
        const existing = this.objectMap.get(objectKey(obj));
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
      const obj = [...this._objectsById.values()].find((o) => objectKey(o) === objectId || o.objectId === objectId);
      if (!obj) continue;

      const parentId = obj.parentObjectId;
      if (parentId == null || parentId === 0) continue;

      const parent = this.objectMap.get(parentId);
      if (parent && clone.parent !== parent) {
        parent.add(clone);
      }
    }
  }

  private _applyTransform(obj: ObjData, node: THREE.Object3D, time: number): void {
    const entries = this._channelsById.get(channelKey(obj));
    if (!entries) return;

    const hadSample = sampleObjectTransformScratch(entries, time, _samplePos, _sampleRot, _sampleScl);
    if (!hadSample) return;

    node.position.copy(_samplePos);
    node.quaternion.copy(_sampleRot);
    node.scale.copy(_sampleScl);
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

      const parentId = obj.parentObjectId;
      const parent = parentId != null && parentId !== 0 ? this.objectMap.get(parentId) : null;
      (parent ?? this.scene).add(clone);

      return clone;
    }

    return null;
  }
}
