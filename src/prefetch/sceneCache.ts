import { createStore, del, get, set } from 'idb-keyval';

/**
 * A persistent, size-bounded cache of decoded scene GLBs, so a version downloaded (or prefetched)
 * once opens instantly on every later visit. A scene revision is immutable and its URL carries
 * the hash, so the URL path is a perfect key and entries never go stale.
 *
 * Bytes live in the Cache Storage API; a small LRU index (size, last use) lives in IndexedDB.
 * Both sit behind interfaces so the eviction logic is testable. Every operation degrades to "no
 * cache" when storage is unavailable (private mode, quota, no Cache API): errors are swallowed and
 * the caller just downloads. The storage is best effort (the browser may evict it); the cache is
 * rebuildable, so it never asks for persistent storage, which some browsers answer with a prompt.
 */

export interface ByteStore {
  read(key: string): Promise<ArrayBuffer | null>;
  write(key: string, data: ArrayBuffer): Promise<void>;
  remove(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface CacheEntry {
  key: string;
  size: number;
  usedAt: number;
}

export interface IndexStore {
  load(): Promise<CacheEntry[]>;
  save(entries: CacheEntry[]): Promise<void>;
}

export interface SceneCacheOptions {
  maxBytes: number;
  /** Storage quota in bytes when the browser reports one; the cache never takes more than half. */
  quota: () => Promise<number | null>;
  now: () => number;
}

export interface CacheInfo {
  count: number;
  bytes: number;
  budget: number;
}

const QUOTA_SHARE = 0.5;

export class SceneCache {
  private entries: Map<string, CacheEntry> | null = null;
  // Every operation runs through this chain: the index is read-modify-write.
  private chain: Promise<unknown> = Promise.resolve();
  private generation = 0;

  private readonly bytes: ByteStore;
  private readonly index: IndexStore;
  private readonly options: SceneCacheOptions;

  constructor(bytes: ByteStore, index: IndexStore, options: SceneCacheOptions) {
    this.bytes = bytes;
    this.index = index;
    this.options = options;
  }

  private run<T>(fallback: T, task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task).catch(() => fallback);
    this.chain = next;
    return next;
  }

  private async load(): Promise<Map<string, CacheEntry>> {
    if (!this.entries) this.entries = new Map((await this.index.load()).map((e) => [e.key, e]));
    return this.entries;
  }

  private async persist(entries: Map<string, CacheEntry>): Promise<void> {
    await this.index.save([...entries.values()]);
  }

  private async budget(): Promise<number> {
    const quota = await this.options.quota().catch(() => null);
    return quota ? Math.min(this.options.maxBytes, Math.floor(quota * QUOTA_SHARE)) : this.options.maxBytes;
  }

  private async used(): Promise<number> {
    let total = 0;
    for (const e of (await this.load()).values()) total += e.size;
    return total;
  }

  /** The cached bytes for `key`, or null. Counts as a use. */
  get(key: string): Promise<ArrayBuffer | null> {
    return this.run(null, async () => {
      const entries = await this.load();
      const entry = entries.get(key);
      if (!entry) return null;
      const data = await this.bytes.read(key);
      if (!data) {
        entries.delete(key);
        await this.persist(entries);
        return null;
      }
      entry.usedAt = this.options.now();
      await this.persist(entries);
      return data;
    });
  }

  has(key: string): Promise<boolean> {
    return this.run(false, async () => (await this.load()).has(key));
  }

  /** Whether `size` more bytes fit without evicting anything: the prefetcher never pushes entries out. */
  canFit(size: number): Promise<boolean> {
    return this.run(false, async () => (await this.used()) + size <= (await this.budget()));
  }

  /** Stores `data`, evicting least recently used entries to stay within the budget. Returns whether it was kept. */
  put(key: string, data: ArrayBuffer): Promise<boolean> {
    const generation = this.generation;
    return this.run(false, async () => {
      if (generation !== this.generation) return false;
      const size = data.byteLength;
      const budget = await this.budget();
      if (size > budget) return false;

      const entries = await this.load();
      entries.delete(key);
      let total = await this.used();
      const oldestFirst = [...entries.values()].sort((a, b) => a.usedAt - b.usedAt);
      for (const victim of oldestFirst) {
        if (total + size <= budget) break;
        await this.bytes.remove(victim.key).catch(() => undefined);
        entries.delete(victim.key);
        total -= victim.size;
      }

      try {
        await this.bytes.write(key, data);
      } catch {
        await this.bytes.remove(key).catch(() => undefined);
        await this.persist(entries);
        return false;
      }
      entries.set(key, { key, size, usedAt: this.options.now() });
      await this.persist(entries);
      return true;
    });
  }

  /** Drops everything (sign-out: the data belongs to the signed-in user). Writes already queued are discarded. */
  clear(): Promise<void> {
    this.generation++;
    return this.run(undefined, async () => {
      this.entries = new Map();
      await this.bytes.clear();
      await this.persist(this.entries);
    });
  }

  info(): Promise<CacheInfo> {
    return this.run({ count: 0, bytes: 0, budget: 0 }, async () => {
      const entries = await this.load();
      return { count: entries.size, bytes: await this.used(), budget: await this.budget() };
    });
  }
}

// ---- Browser backends -------------------------------------------------------------------------

const CACHE_NAME = 'moodyblues-scenes-v1';
const MAX_BYTES = 512 * 1024 * 1024;

const cacheKey = (key: string) => new Request(new URL(key, location.origin));

const browserBytes: ByteStore = {
  async read(key) {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(cacheKey(key));
    return res ? res.arrayBuffer() : null;
  },
  async write(key, data) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(cacheKey(key), new Response(data, { headers: { 'Content-Type': 'model/gltf-binary' } }));
  },
  async remove(key) {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(cacheKey(key));
  },
  async clear() {
    await caches.delete(CACHE_NAME);
  },
};

const indexDb = createStore('moodyblues-scene-cache', 'index');
const INDEX_KEY = 'entries';

const browserIndex: IndexStore = {
  async load() {
    return (await get<CacheEntry[]>(INDEX_KEY, indexDb)) ?? [];
  },
  async save(entries) {
    if (entries.length === 0) await del(INDEX_KEY, indexDb);
    else await set(INDEX_KEY, entries, indexDb);
  },
};

/** The app's cache. Without the Cache API every call is a harmless miss. */
export const sceneCache = new SceneCache(browserBytes, browserIndex, {
  maxBytes: MAX_BYTES,
  quota: async () => (await navigator.storage?.estimate?.())?.quota ?? null,
  now: () => Date.now(),
});

/** Scene URLs worth caching: an owner scene file pinned to one revision by its hash. Share links are never cached. */
export function isCacheableSceneUrl(url: string): boolean {
  return url.startsWith('/api/projects/') && url.includes('/file?hash=');
}
