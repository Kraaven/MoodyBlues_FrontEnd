import { describe, expect, it } from 'vitest';
import { SceneCache, type ByteStore, type CacheEntry, type IndexStore } from './sceneCache';

function setup(maxBytes: number, quota: number | null = null) {
  const data = new Map<string, ArrayBuffer>();
  let saved: CacheEntry[] = [];
  const bytes: ByteStore = {
    read: async (k) => data.get(k) ?? null,
    write: async (k, d) => void data.set(k, d),
    remove: async (k) => void data.delete(k),
    clear: async () => data.clear(),
  };
  const index: IndexStore = { load: async () => saved, save: async (e) => void (saved = e) };
  let clock = 0;
  const cache = new SceneCache(bytes, index, { maxBytes, quota: async () => quota, now: () => ++clock });
  return { cache, data, saved: () => saved };
}

const buf = (n: number) => new ArrayBuffer(n);

describe('SceneCache', () => {
  it('stores and returns bytes', async () => {
    const { cache } = setup(100);
    expect(await cache.put('a', buf(10))).toBe(true);
    expect((await cache.get('a'))?.byteLength).toBe(10);
    expect(await cache.get('missing')).toBeNull();
  });

  it('evicts the least recently used entry beyond the budget', async () => {
    const { cache, data } = setup(30);
    await cache.put('a', buf(10));
    await cache.put('b', buf(10));
    await cache.put('c', buf(10));
    await cache.get('a'); // a is now newer than b
    await cache.put('d', buf(10));
    expect(await cache.has('b')).toBe(false);
    expect(await cache.has('a')).toBe(true);
    expect([...data.keys()].sort()).toEqual(['a', 'c', 'd']);
  });

  it('refuses entries larger than the budget', async () => {
    const { cache } = setup(30);
    expect(await cache.put('big', buf(31))).toBe(false);
  });

  it('caps the budget at half the storage quota', async () => {
    const { cache } = setup(1000, 40);
    expect((await cache.info()).budget).toBe(20);
    expect(await cache.put('a', buf(25))).toBe(false);
  });

  it('canFit never counts eviction', async () => {
    const { cache } = setup(30);
    await cache.put('a', buf(20));
    expect(await cache.canFit(10)).toBe(true);
    expect(await cache.canFit(11)).toBe(false);
  });

  it('drops index entries whose bytes vanished', async () => {
    const { cache, data } = setup(30);
    await cache.put('a', buf(10));
    data.clear();
    expect(await cache.get('a')).toBeNull();
    expect(await cache.has('a')).toBe(false);
  });

  it('clear empties everything and discards writes queued before it', async () => {
    const { cache, data, saved } = setup(100);
    await cache.put('a', buf(10));
    const pending = cache.put('b', buf(10));
    await cache.clear();
    expect(await pending).toBe(false);
    expect(data.size).toBe(0);
    expect(saved()).toEqual([]);
  });

  it('degrades to a miss when storage throws', async () => {
    const failing: ByteStore = {
      read: async () => Promise.reject(new Error('x')),
      write: async () => Promise.reject(new Error('quota')),
      remove: async () => undefined,
      clear: async () => undefined,
    };
    const cache = new SceneCache(failing, { load: async () => [], save: async () => undefined }, { maxBytes: 100, quota: async () => null, now: () => 0 });
    expect(await cache.put('a', buf(1))).toBe(false);
    expect(await cache.get('a')).toBeNull();
  });
});
