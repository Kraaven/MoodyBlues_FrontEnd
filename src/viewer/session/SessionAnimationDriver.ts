import * as THREE from 'three';
import type { AnimationData } from '../../lib/types';
import { resolveLifecycle, sampleObjectTransform } from './animationSampling';

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

type Baseline = { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 };

export class SessionAnimationDriver {
  readonly animation: AnimationData;
  readonly objectMap: ObjectMap;
  readonly scene: THREE.Object3D;

  private _baselines = new Map<number, Baseline>();
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
    for (const clone of this._spawnedClones.values()) {
      this.scene.remove(clone);
    }
    this._spawnedClones.clear();
    this._playing = false;
  }

  private _apply(time: number): void {
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
      if (visible) {
        this._applyTransform(obj, node, time);
      }
    }

    this._reparentSpawned();
  }

  private _rebuildState(time: number): void {
    for (const clone of this._spawnedClones.values()) {
      this.scene.remove(clone);
    }
    for (const id of this._spawnedClones.keys()) {
      this.objectMap.delete(id);
    }
    this._spawnedClones.clear();

    for (const obj of this.animation.objects) {
      const defaultAlive = obj.templateObjectId === null;
      const { alive, visible } = resolveLifecycle(obj.lifecycle, time, defaultAlive);

      if (!alive) {
        const existing = this.objectMap.get(obj.objectId);
        if (existing) existing.visible = false;
        continue;
      }

      const node = this._resolveNode(obj);
      if (!node) continue;

      node.visible = visible;
      if (visible) {
        this._applyTransform(obj, node, time);
      }
    }

    this._reparentSpawned();
  }

  private _reparentSpawned(): void {
    for (const [objectId, clone] of this._spawnedClones) {
      const obj = this.animation.objects.find(o => o.objectId === objectId);
      if (!obj) continue;

      const parentId = obj.parentObjectId;
      if (parentId == null || parentId === 0) continue;

      const parent = this.objectMap.get(parentId);
      if (parent && clone.parent !== parent) {
        parent.add(clone);
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
  }

  private _resolveNode(obj: { objectId: number; templateObjectId: number | null; parentObjectId: number | null }): THREE.Object3D | null {
    if (this.objectMap.has(obj.objectId)) {
      return this.objectMap.get(obj.objectId)!;
    }

    if (obj.templateObjectId !== null) {
      const template = this.objectMap.get(obj.templateObjectId);
      if (!template) return null;

      const clone = template.clone(true);
      template.visible = false;
      this.objectMap.set(obj.objectId, clone);
      this._spawnedClones.set(obj.objectId, clone);

      if (clone.userData && typeof obj.objectId === 'number') {
        clone.userData.objectId = obj.objectId;
      }

      this.scene.add(clone);

      return clone;
    }

    return null;
  }
}
