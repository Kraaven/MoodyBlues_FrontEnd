import * as THREE from 'three';
import { ReplayObjectKind, type Replay, type ReplayObject } from './replayFile';
import { quaternionTrack, vectorTrack, visibilityTrack } from './replayTracks';

/**
 * Plays a compiled session replay on top of the scene GLB it was recorded in.
 *
 * Every recorded object gets its own `AnimationClip` (position, rotation, scale and visibility
 * tracks) and its own action on one shared `AnimationMixer`, so all objects play in sync from one
 * clock. The transform curves come straight from the replay file and are already in glTF space,
 * the same space as the GLB's nodes, so they are applied as-is.
 *
 * Two things a glTF-style clip cannot express are handled here:
 * - **Spawns.** A spawned object is a clone of its template node, created when the playhead enters
 *   its lifetime and removed when it leaves (so a long session with many short-lived objects only
 *   holds the ones alive at the current time). Removed clones go to a per-template pool.
 * - **Reparenting.** Each frame, every object whose parent changes during the session is moved to
 *   the parent it has at the current time. Tracks hold local transforms, so the clip drives the
 *   object correctly under whichever parent it currently has.
 *
 * Time is absolute: `seek(t)` and playback both end in `mixer.setTime(t)`, so scrubbing is a pure
 * function of the playhead with no accumulated state. Clip durations are set past the end of the
 * session so actions never reach their "finished" state, which would otherwise pause them.
 */
export class ReplayPlayer {
  readonly replay: Replay;
  readonly duration: number;
  currentTime = 0;
  playing = true;
  speed = 1;

  private readonly root: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly sceneNodes = new Map<number, THREE.Object3D>();
  private readonly originalParents = new Map<number, THREE.Object3D>();
  private readonly clips = new Map<number, THREE.AnimationClip>();
  private readonly spawned: ReplayObject[] = [];
  private readonly liveClones = new Map<number, THREE.Object3D>();
  private readonly liveActions = new Map<number, THREE.AnimationAction>();
  private readonly clonePool = new Map<number, THREE.Object3D[]>();
  /** objectId -> parent changes sorted by time (parent 0 = scene root). */
  private readonly parentChanges = new Map<number, { time: number; parent: number }[]>();

  constructor(gltfScene: THREE.Object3D, replay: Replay) {
    this.root = gltfScene;
    this.replay = replay;
    this.duration = replay.durationSeconds;
    this.mixer = new THREE.AnimationMixer(gltfScene);

    gltfScene.traverse((node) => {
      const id = node.userData?.objectId;
      if (typeof id === 'number' && !this.sceneNodes.has(id)) {
        this.sceneNodes.set(id, node);
        if (node.parent) this.originalParents.set(id, node.parent);
      }
    });

    for (const event of replay.events) {
      if (event.type !== 'Reparent') continue;
      const list = this.parentChanges.get(event.objectId) ?? [];
      list.push({ time: event.time, parent: event.a });
      this.parentChanges.set(event.objectId, list);
    }

    const visibility = this.buildVisibilityChanges();
    const clipDuration = this.duration + 1;

    for (const obj of replay.objects) {
      const tracks: THREE.KeyframeTrack[] = [];
      if (obj.position) tracks.push(vectorTrack('.position', obj.position));
      if (obj.rotation) tracks.push(quaternionTrack(obj.rotation));
      if (obj.scale) tracks.push(vectorTrack('.scale', obj.scale));
      const vis = visibility.get(obj.objectId);
      if (vis && vis.length > 0) tracks.push(visibilityTrack(vis));
      if (tracks.length === 0) continue;

      this.clips.set(obj.objectId, new THREE.AnimationClip(`object-${obj.objectId}`, clipDuration, tracks));

      if (obj.kind === ReplayObjectKind.Spawned) {
        this.spawned.push(obj);
      } else {
        const node = this.sceneNodes.get(obj.objectId);
        if (node) this.mixer.clipAction(this.clips.get(obj.objectId)!, node).play();
      }
    }

    this.apply(0);
  }

  /** Advances playback by a frame's real-time delta. */
  update(deltaSeconds: number): void {
    if (this.playing) {
      const next = this.currentTime + Math.min(deltaSeconds, 1) * this.speed;
      if (next >= this.duration) {
        this.currentTime = this.duration;
        this.playing = false;
      } else {
        this.currentTime = next;
      }
    }
    this.apply(this.currentTime);
  }

  seek(time: number): void {
    this.currentTime = Math.min(Math.max(time, 0), this.duration);
    this.apply(this.currentTime);
  }

  /** Is this node (and every ancestor) visible right now? For picking. */
  static isEffectivelyVisible(node: THREE.Object3D | null): boolean {
    for (let n = node; n; n = n.parent) {
      if (!n.visible) return false;
    }
    return true;
  }

  /** The object currently standing in for an object id (scene node or live clone). */
  getObject(objectId: number): THREE.Object3D | undefined {
    return this.liveClones.get(objectId) ?? this.sceneNodes.get(objectId);
  }

  dispose(): void {
    this.mixer.stopAllAction();
    for (const [id, clone] of this.liveClones) {
      const clip = this.clips.get(id);
      if (clip) this.mixer.uncacheAction(clip, clone);
      clone.removeFromParent();
    }
    this.liveClones.clear();
    this.liveActions.clear();
    for (const clip of this.clips.values()) this.mixer.uncacheClip(clip);
    this.clonePool.clear();
  }

  // ---------------------------------------------------------------------------------------------

  private apply(t: number): void {
    this.updateSpawns(t);
    this.updateParents(t);
    this.mixer.setTime(t);
  }

  private updateSpawns(t: number): void {
    for (const obj of this.spawned) {
      const alive = t >= obj.spawnTime && (obj.deleteTime < 0 || t < obj.deleteTime);
      const live = this.liveClones.get(obj.objectId);
      if (alive && !live) {
        this.spawn(obj, t);
      } else if (!alive && live) {
        this.despawn(obj, live);
      }
    }
  }

  private spawn(obj: ReplayObject, t: number): void {
    const template = this.sceneNodes.get(obj.templateObjectId);
    const clip = this.clips.get(obj.objectId);
    if (!template || !clip) return;

    const pool = this.clonePool.get(obj.templateObjectId);
    const clone = pool?.pop() ?? this.cloneTemplate(template);
    clone.userData = { ...clone.userData, objectId: obj.objectId, isHidden: false };
    clone.visible = true;

    this.resolveParent(this.parentAt(obj, t)).add(clone);
    this.liveClones.set(obj.objectId, clone);
    const action = this.mixer.clipAction(clip, clone);
    action.play();
    this.liveActions.set(obj.objectId, action);
  }

  private despawn(obj: ReplayObject, clone: THREE.Object3D): void {
    const action = this.liveActions.get(obj.objectId);
    const clip = this.clips.get(obj.objectId);
    action?.stop();
    if (clip) this.mixer.uncacheAction(clip, clone);
    clone.removeFromParent();
    this.liveClones.delete(obj.objectId);
    this.liveActions.delete(obj.objectId);

    const pool = this.clonePool.get(obj.templateObjectId) ?? [];
    pool.push(clone);
    this.clonePool.set(obj.templateObjectId, pool);
  }

  private cloneTemplate(template: THREE.Object3D): THREE.Object3D {
    const clone = template.clone(true);
    // Descendants of the clone are not the template's tracked children: drop their ids so a
    // click on part of a clone reports the clone, not the template.
    clone.traverse((node) => {
      if (node !== clone && node.userData && 'objectId' in node.userData) {
        const { objectId: _ignored, ...rest } = node.userData;
        node.userData = rest;
      }
    });
    return clone;
  }

  private updateParents(t: number): void {
    for (const [objectId, changes] of this.parentChanges) {
      const node = this.getObject(objectId);
      if (!node) continue;

      let parentId: number | null = null;
      for (const change of changes) {
        if (change.time <= t) parentId = change.parent;
        else break;
      }

      let desired: THREE.Object3D;
      if (parentId === null) {
        const obj = this.replay.objectsById.get(objectId);
        desired = obj && obj.kind === ReplayObjectKind.Spawned
          ? this.resolveParent(obj.initialParentObjectId)
          : (this.originalParents.get(objectId) ?? this.root);
      } else {
        desired = this.resolveParent(parentId);
      }

      // add() keeps the local transform, which is what the clip drives.
      if (node.parent !== desired && desired !== node) desired.add(node);
    }
  }

  private parentAt(obj: ReplayObject, t: number): number {
    let parent = obj.initialParentObjectId;
    for (const change of this.parentChanges.get(obj.objectId) ?? []) {
      if (change.time <= t) parent = change.parent;
      else break;
    }
    return parent;
  }

  private resolveParent(parentId: number): THREE.Object3D {
    if (parentId === 0) return this.root;
    return this.getObject(parentId) ?? this.root;
  }

  /**
   * Per object, the visibility changes over the session as step keys. Scene objects start as
   * the GLB says (inactive GameObjects are exported with `isHidden`); spawned objects start
   * visible at their spawn. Hide/Show set the object's own flag; three.js hides a node's whole
   * subtree when it is invisible, which is the cascade the protocol requires. Deletion (including
   * the cascade to descendants, precomputed by the backend) hides the object for good.
   */
  private buildVisibilityChanges(): Map<number, { time: number; visible: boolean }[]> {
    const changes = new Map<number, { time: number; visible: boolean }[]>();
    const get = (id: number) => {
      let list = changes.get(id);
      if (!list) {
        list = [];
        changes.set(id, list);
      }
      return list;
    };

    for (const obj of this.replay.objects) {
      const list = get(obj.objectId);
      if (obj.kind === ReplayObjectKind.Spawned) {
        list.push({ time: obj.spawnTime, visible: true });
      } else {
        const node = this.sceneNodes.get(obj.objectId);
        list.push({ time: 0, visible: node ? node.userData?.isHidden !== true : true });
      }
    }

    for (const event of this.replay.events) {
      if (event.type === 'Show') get(event.objectId).push({ time: event.time, visible: true });
      else if (event.type === 'Hide') get(event.objectId).push({ time: event.time, visible: false });
    }

    for (const obj of this.replay.objects) {
      if (obj.deleteTime >= 0) get(obj.objectId).push({ time: obj.deleteTime, visible: false });
    }

    for (const list of changes.values()) list.sort((a, b) => a.time - b.time);
    return changes;
  }
}
