import { useEffect, useState } from 'react';
import { createStore, del, entries, get, set } from 'idb-keyval';

/**
 * Scene thumbnails (DESIGN.md 7.4). The backend stores none, but a scene version is immutable, so
 * its hash is a perfect cache key: the first time a version is shown in the Stage, one image is
 * rendered offscreen and kept in IndexedDB. Nothing here is shared between browsers; a scene nobody
 * has opened on this machine shows a placeholder instead.
 *
 * Every function degrades to "no snapshot" if IndexedDB is unavailable (private mode, quota).
 */

// A database of its own, so nothing else using IndexedDB on this origin can get in the way.
const store = createStore('moodyblues-snapshots', 'snapshots');
const PREFIX = 'snapshot:';
const MAX_SNAPSHOTS = 80;

interface Stored {
  blob: Blob;
  at: number;
}

const urls = new Map<string, string>();
const attempted = new Set<string>();
const listeners = new Set<() => void>();

export async function getSnapshotUrl(hash: string): Promise<string | null> {
  const cached = urls.get(hash);
  if (cached) return cached;
  try {
    const stored = await get<Stored>(PREFIX + hash, store);
    if (!stored) return null;
    const url = URL.createObjectURL(stored.blob);
    urls.set(hash, url);
    return url;
  } catch {
    return null;
  }
}

/** Keeps an image for a scene version and tells every list showing it. Returns false when storage is unavailable. */
export async function storeSnapshot(hash: string, blob: Blob): Promise<boolean> {
  const stored = await put(hash, blob);
  if (stored) listeners.forEach((l) => l());
  return stored;
}

async function put(hash: string, blob: Blob): Promise<boolean> {
  try {
    await set(PREFIX + hash, { blob, at: Date.now() } satisfies Stored, store);
    const all = (await entries<string, Stored>(store)).filter(([key]) => typeof key === 'string' && key.startsWith(PREFIX));
    if (all.length > MAX_SNAPSHOTS) {
      all.sort((a, b) => a[1].at - b[1].at);
      for (const [key] of all.slice(0, all.length - MAX_SNAPSHOTS)) {
        await del(key, store);
        urls.delete(String(key).slice(PREFIX.length));
      }
    }
    return true;
  } catch (err) {
    // No storage: the placeholder is used instead.
    console.debug('[stage] snapshot could not be stored:', err);
    return false;
  }
}

/** Marks a capture as begun; false if one was already tried this session. */
export function beginSnapshot(hash: string): boolean {
  if (attempted.has(hash)) return false;
  attempted.add(hash);
  return true;
}

/** True if a snapshot was already tried this session (successfully or not). */
export function snapshotAttempted(hash: string): boolean {
  return attempted.has(hash);
}

/** The snapshot for a scene version, or null while there is none. Updates when one is captured. */
export function useSnapshot(hash: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(hash ? (urls.get(hash) ?? null) : null);

  useEffect(() => {
    if (!hash) {
      setUrl(null);
      return;
    }
    let alive = true;
    const load = () => {
      void getSnapshotUrl(hash).then((found) => alive && setUrl(found));
    };
    load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, [hash]);

  return url;
}
