import * as THREE from 'three';
import { clone as cloneWithSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { disposeObject3D } from '../viewer/core/gltf';
import { loadSceneGltf } from './sceneSource';
import { refKey, type SceneRef } from './store';

/**
 * Downloaded scene versions, shared between views (DESIGN.md 4.4: going from a scene into one of
 * its sessions reuses the scene already on screen instead of downloading it again).
 *
 * A scene version is immutable (its hash never changes), so the hash is a perfect cache key. Every
 * consumer holds a lease while it uses the scene; a scene nobody holds is kept for a moment in case
 * the user comes back, and freed once more than MAX_IDLE are waiting.
 *
 * Consumers must not change the master graph. A replay takes `cloneScene(master)` and animates that.
 */

/** What the glTF file itself says, kept for the inspector. */
export interface SceneInfo {
  /** The parsed glTF JSON (nodes, meshes, materials, extensions used). */
  json: Record<string, unknown>;
  animationCount: number;
  generator: string | null;
}

interface Entry {
  key: string;
  info: SceneInfo | null;
  refs: number;
  root: THREE.Object3D | null;
  promise: Promise<THREE.Object3D>;
  controller: AbortController;
  usedAt: number;
  listeners: Set<(received: number, total: number | null) => void>;
  last: { received: number; total: number | null };
}

const entries = new Map<string, Entry>();
const MAX_IDLE = 2;

export function sceneKey(ref: SceneRef): string {
  return refKey(ref);
}

export interface SceneLease {
  /** Resolves to the shared master graph. Rejects with an AbortError if released first. */
  promise: Promise<THREE.Object3D>;
  release: () => void;
}

function prune(): void {
  const idle = [...entries.values()].filter((e) => e.refs === 0 && e.root).sort((a, b) => a.usedAt - b.usedAt);
  while (idle.length > MAX_IDLE) {
    const oldest = idle.shift()!;
    entries.delete(oldest.key);
    disposeObject3D(oldest.root!);
  }
}

export function acquireScene(
  renderer: THREE.WebGLRenderer,
  ref: SceneRef,
  onProgress?: (received: number, total: number | null) => void,
): SceneLease {
  const key = sceneKey(ref);
  let entry = entries.get(key);

  if (!entry) {
    const controller = new AbortController();
    const created: Entry = {
      key,
      info: null,
      refs: 0,
      root: null,
      controller,
      usedAt: Date.now(),
      listeners: new Set(),
      last: { received: 0, total: null },
      promise: Promise.resolve(null as unknown as THREE.Object3D),
    };
    created.promise = loadSceneGltf(
      renderer,
      ref.developerId,
      ref.sceneId,
      ref.hash,
      (received, total) => {
        created.last = { received, total };
        created.listeners.forEach((l) => l(received, total));
      },
      controller.signal,
    ).then(
      (gltf) => {
        created.root = gltf.scene;
        created.info = {
          json: (gltf.parser.json ?? {}) as Record<string, unknown>,
          animationCount: gltf.animations.length,
          generator: gltf.asset?.generator ?? null,
        };
        return gltf.scene;
      },
      (err) => {
        // A failed load must not be cached, or Retry would get the same failure.
        if (entries.get(key) === created) entries.delete(key);
        throw err;
      },
    );
    // Consumers handle rejections themselves; this keeps an abandoned load from being "unhandled".
    created.promise.catch(() => undefined);
    entries.set(key, created);
    entry = created;
  }

  const held = entry;
  held.refs += 1;
  held.usedAt = Date.now();
  if (onProgress) {
    held.listeners.add(onProgress);
    if (held.last.received > 0) onProgress(held.last.received, held.last.total);
  }

  let released = false;
  return {
    promise: held.promise,
    release: () => {
      if (released) return;
      released = true;
      held.refs -= 1;
      if (onProgress) held.listeners.delete(onProgress);
      held.usedAt = Date.now();
      if (held.refs === 0 && !held.root) {
        // Nobody is waiting for a download that has not finished: stop it.
        held.controller.abort();
        entries.delete(held.key);
      } else {
        prune();
      }
    },
  };
}

/** A copy a replay can animate without touching the shared master. Geometry and materials are shared. */
export function cloneScene(master: THREE.Object3D): THREE.Object3D {
  return cloneWithSkeleton(master);
}

/** The glTF file's own description of a cached scene, or null if it has not loaded. */
export function sceneInfo(ref: SceneRef): SceneInfo | null {
  return entries.get(sceneKey(ref))?.info ?? null;
}

/** For the Debug panel: what is cached and who holds it. */
export function sceneCacheInfo(): { key: string; refs: number; loaded: boolean }[] {
  return [...entries.values()].map((e) => ({ key: e.key, refs: e.refs, loaded: e.root !== null }));
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
