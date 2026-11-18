import { beforeEach, describe, expect, it, vi } from 'vitest';

const downloadResource = vi.hoisted(() => vi.fn());
vi.mock('../api/queries', () => ({ downloadResource }));
vi.mock('./sceneCache', () => ({ isCacheableSceneUrl: () => false, sceneCache: { get: async () => null, put: async () => true } }));

import { fetchSceneBytes } from './sceneFetch';

/** A download that stays open until `finish` is called, and rejects like fetch does when its signal aborts. */
function pendingDownloads() {
  const finishers: ((bytes: number) => void)[] = [];
  downloadResource.mockImplementation((_url: string, _progress: unknown, signal: AbortSignal) => {
    return new Promise((resolve, reject) => {
      finishers.push((bytes) => resolve({ buffer: new ArrayBuffer(bytes), immutable: false }));
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
  });
  return finishers;
}

describe('fetchSceneBytes', () => {
  beforeEach(() => {
    downloadResource.mockReset();
  });

  it('shares one download between concurrent callers', async () => {
    const finishers = pendingDownloads();
    const a = fetchSceneBytes('/shared-a');
    const b = fetchSceneBytes('/shared-a');
    expect(downloadResource).toHaveBeenCalledTimes(1);
    finishers[0](8);
    expect((await a).byteLength).toBe(8);
    expect((await b).byteLength).toBe(8);
  });

  it('does not join a flight that was aborted', async () => {
    const finishers = pendingDownloads();
    const first = new AbortController();
    const abandoned = fetchSceneBytes('/aborted', undefined, first.signal);
    first.abort();
    // The aborted download has not settled yet, which is when a second caller used to join it.
    const retry = fetchSceneBytes('/aborted');
    expect(downloadResource).toHaveBeenCalledTimes(2);
    finishers[1](4);
    expect((await retry).byteLength).toBe(4);
    await expect(abandoned).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('keeps a newer flight when an older one finishes', async () => {
    const finishers = pendingDownloads();
    const first = new AbortController();
    const abandoned = fetchSceneBytes('/stale', undefined, first.signal);
    first.abort();
    const newer = fetchSceneBytes('/stale');
    await expect(abandoned).rejects.toMatchObject({ name: 'AbortError' });
    // The old flight's cleanup has run by now; it must not have removed the newer one.
    const joiner = fetchSceneBytes('/stale');
    expect(downloadResource).toHaveBeenCalledTimes(2);
    finishers[1](6);
    expect((await newer).byteLength).toBe(6);
    expect((await joiner).byteLength).toBe(6);
  });
});
