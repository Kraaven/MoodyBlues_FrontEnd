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
 * Three things a glTF-style clip cannot express are handled here:
 * - **Spawns.** A spawned object is a clone of its template node, created when the playhead enters
 *   its lifetime and removed when it leaves, so only objects alive at the current time exist.
 *   Removed clones go to a per-template pool.
 * - **Spawned parts** (protocol v3). A clone's descendants are recorded objects of their own
 *   (kind 2): each is the clone's copy of one template node, found by walking the template and
 *   the clone in parallel. Their actions live and die with the clone.
 * - **Reparenting.** Each frame, every object whose parent changes during the session is moved to
 *   the parent it has at the current time. Tracks hold local transforms, so `add()` (not
 *   `attach()`) is correct.
 *
 * Time is absolute: `seek(t)` and playback both end in `mixer.setTime(t)`, so scrubbing is a pure
 * function of the playhead with no accumulated state. Clip durations run past the end of the
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
  /** Spawned root id -> its parts. */
  private readonly partsByRoot = new Map<number, ReplayObject[]>();
  private readonly liveClones = new Map<number, LiveClone>();
  /** Part id -> its node inside the live clone. */
  private readonly liveParts = new Map<number, THREE.Object3D>();
  private readonly clonePool = new Map<number, PooledClone[]>();
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

    for (const obj of replay.objects) {
      if (obj.kind !== ReplayObjectKind.SpawnedPart) continue;
      const rootId = this.spawnRootOf(obj);
      if (rootId === null) continue;
      const list = this.partsByRoot.get(rootId) ?? [];
      list.push(obj);
      this.partsByRoot.set(rootId, list);
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
      if (tracks.length > 0) this.clips.set(obj.objectId, new THREE.AnimationClip(`object-${obj.objectId}`, clipDuration, tracks));

      if (obj.kind === ReplayObjectKind.Spawned) {
        this.spawned.push(obj);
      } else if (obj.kind === ReplayObjectKind.Scene) {
        const node = this.sceneNodes.get(obj.objectId);
        const clip = this.clips.get(obj.objectId);
        if (node && clip) this.mixer.clipAction(clip, node).play();
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

  /** The scene GLB's root node. */
  get sceneRoot(): THREE.Object3D {
    return this.root;
  }

  /** The node currently standing in for an object id: a scene node, a live clone or a clone's part. */
  getObject(objectId: number): THREE.Object3D | undefined {
    return this.liveClones.get(objectId)?.node ?? this.liveParts.get(objectId) ?? this.sceneNodes.get(objectId);
  }

  /** Whether an object exists at time t (scene objects until deleted; spawns within their lifetime). */
  isAlive(obj: ReplayObject, t: number): boolean {
    const born = obj.kind === ReplayObjectKind.Scene ? true : t >= obj.spawnTime;
    return born && (obj.deleteTime < 0 || t < obj.deleteTime);
  }

  /** The recorded object a node belongs to, walking up to the nearest node with an id. */
  objectIdOf(node: THREE.Object3D | null): number | null {
    for (let n = node; n; n = n.parent) {
      if (typeof n.userData?.objectId === 'number') return n.userData.objectId as number;
      if (n === this.root) break;
    }
    return null;
  }

  /** A display name for an object: its node name, or its template's. */
  nameOf(objectId: number): string {
    const node = this.getObject(objectId);
    if (node?.name) return node.name;
    const obj = this.replay.objectsById.get(objectId);
    const template = obj ? this.sceneNodes.get(obj.templateObjectId) : undefined;
    return template?.name || `Object ${objectId}`;
  }

  dispose(): void {
    this.mixer.stopAllAction();
    for (const [id, live] of this.liveClones) this.removeClone(id, live, false);
    this.liveClones.clear();
    this.liveParts.clear();
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
      if (alive && !live) this.spawn(obj, t);
      else if (!alive && live) this.removeClone(obj.objectId, live, true);
    }
  }

  private spawn(obj: ReplayObject, t: number): void {
    const template = this.sceneNodes.get(obj.templateObjectId);
    if (!template) return;

    const pooled = this.clonePool.get(obj.templateObjectId)?.pop() ?? this.cloneTemplate(template);
    pooled.node.userData = { ...pooled.node.userData, objectId: obj.objectId, isHidden: false };
    pooled.node.visible = true;

    const actions: THREE.AnimationAction[] = [];
    const parts: { id: number; node: THREE.Object3D; parent: THREE.Object3D }[] = [];

    for (const part of this.partsByRoot.get(obj.objectId) ?? []) {
      const node = pooled.byTemplateId.get(part.templateObjectId);
      if (!node || !node.parent) continue;
      node.userData = { ...node.userData, objectId: part.objectId };
      this.liveParts.set(part.objectId, node);
      parts.push({ id: part.objectId, node, parent: node.parent });
    }

    this.resolveParent(this.parentAt(obj, t)).add(pooled.node);

    const rootClip = this.clips.get(obj.objectId);
    if (rootClip) actions.push(this.mixer.clipAction(rootClip, pooled.node));
    for (const part of parts) {
      const clip = this.clips.get(part.id);
      if (clip) actions.push(this.mixer.clipAction(clip, part.node));
    }
    for (const action of actions) action.play();

    this.liveClones.set(obj.objectId, { node: pooled.node, templateId: obj.templateObjectId, pooled, actions, parts });
  }

  private removeClone(objectId: number, live: LiveClone, pool: boolean): void {
    for (const action of live.actions) {
      action.stop();
      this.mixer.uncacheAction(action.getClip(), action.getRoot());
    }
    // Put parts that were reparented elsewhere back inside the clone, so the pooled clone is whole.
    for (const part of live.parts) {
      if (part.node.parent !== part.parent) part.parent.add(part.node);
      const { objectId: _id, ...rest } = part.node.userData;
      part.node.userData = rest;
      this.liveParts.delete(part.id);
    }
    live.node.removeFromParent();
    this.liveClones.delete(objectId);
    if (!pool) return;

    live.pooled.reset();
    const list = this.clonePool.get(live.templateId) ?? [];
    list.push(live.pooled);
    this.clonePool.set(live.templateId, list);
  }

  /**
   * Clones a template, mapping each template node with an object id to its copy. Ids are removed
   * from the copies (parts get theirs while the clone is live), so a click on part of a clone never
   * reports the template.
   */
  private cloneTemplate(template: THREE.Object3D): PooledClone {
    const node = template.clone(true);
    const byTemplateId = new Map<number, THREE.Object3D>();
    const pairs: [THREE.Object3D, THREE.Object3D][] = [];
    const walk = (src: THREE.Object3D, dst: THREE.Object3D) => {
      pairs.push([src, dst]);
      const id = src.userData?.objectId;
      if (typeof id === 'number') byTemplateId.set(id, dst);
      if (dst !== node && dst.userData && 'objectId' in dst.userData) {
        const { objectId: _ignored, ...rest } = dst.userData;
        dst.userData = rest;
      }
      for (let i = 0; i < src.children.length && i < dst.children.length; i++) walk(src.children[i], dst.children[i]);
    };
    walk(template, node);

    // Restores the template's pose and visibility, for reuse from the pool.
    const reset = () => {
      for (const [src, dst] of pairs) {
        if (dst === node) continue;
        dst.position.copy(src.position);
        dst.quaternion.copy(src.quaternion);
        dst.scale.copy(src.scale);
        dst.visible = src.userData?.isHidden !== true;
      }
    };

    return { node, byTemplateId, reset };
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
        if (obj && obj.kind === ReplayObjectKind.SpawnedPart) {
          desired = this.liveClones.get(this.spawnRootOf(obj) ?? -1)?.parts.find((p) => p.id === objectId)?.parent ?? node.parent ?? this.root;
        } else if (obj && obj.kind === ReplayObjectKind.Spawned) {
          desired = this.resolveParent(obj.initialParentObjectId);
        } else {
          desired = this.originalParents.get(objectId) ?? this.root;
        }
      } else {
        desired = this.resolveParent(parentId);
      }

      if (node.parent !== desired && desired !== node && !isDescendant(desired, node)) desired.add(node);
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

  /** The spawned root a part belongs to, following initial parents up through other parts. */
  private spawnRootOf(part: ReplayObject): number | null {
    let current: ReplayObject | undefined = part;
    for (let guard = 0; current && guard < 4096; guard++) {
      const parent = this.replay.objectsById.get(current.initialParentObjectId);
      if (!parent) return null;
      if (parent.kind === ReplayObjectKind.Spawned) return parent.objectId;
      if (parent.kind !== ReplayObjectKind.SpawnedPart) return null;
      current = parent;
    }
    return null;
  }

  /**
   * Per object, the visibility changes over the session as step keys. Scene objects start as
   * the GLB says (inactive GameObjects are exported with `isHidden`); spawned objects start
   * visible at their spawn, and their parts as their template node is. Hide/Show set the object's
   * own flag; three.js hides a node's whole subtree when it is invisible, which is the cascade the
   * protocol requires. Deletion (including the cascade to descendants, precomputed by the backend)
   * hides the object for good.
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
      } else if (obj.kind === ReplayObjectKind.SpawnedPart) {
        const template = this.sceneNodes.get(obj.templateObjectId);
        list.push({ time: obj.spawnTime, visible: template?.userData?.isHidden !== true });
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

interface PooledClone {
  node: THREE.Object3D;
  byTemplateId: Map<number, THREE.Object3D>;
  reset: () => void;
}

interface LiveClone {
  node: THREE.Object3D;
  templateId: number;
  pooled: PooledClone;
  actions: THREE.AnimationAction[];
  parts: { id: number; node: THREE.Object3D; parent: THREE.Object3D }[];
}

function isDescendant(node: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let n: THREE.Object3D | null = node.parent; n; n = n.parent) if (n === ancestor) return true;
  return false;
}
