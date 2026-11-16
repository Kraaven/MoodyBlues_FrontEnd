import { describe, expect, it } from 'vitest';
import { DEFER_OTHERS_MS, PrefetchQueue, type PrefetchItem } from './queue';

const item = (projectId: string, sceneId: string, hash = 'h'): PrefetchItem => ({
  projectId,
  sceneId,
  url: `/api/projects/${projectId}/scenes/${sceneId}/file?hash=${hash}`,
  sizeBytes: 10,
});

describe('PrefetchQueue', () => {
  it('serves items in insertion order without focus', () => {
    const q = new PrefetchQueue();
    q.add(item('a', '1'));
    q.add(item('b', '1'));
    expect(q.next(0)?.projectId).toBe('a');
  });

  it('keeps one entry per scene, replaced by a newer revision', () => {
    const q = new PrefetchQueue();
    q.add(item('a', '1', 'old'));
    q.add(item('a', '1', 'new'));
    expect(q.size).toBe(1);
    expect(q.next(0)?.url).toContain('new');
  });

  it('puts the focused project first', () => {
    const q = new PrefetchQueue();
    q.add(item('a', '1'));
    q.add(item('b', '1'));
    q.focus('b');
    expect(q.next(0)?.projectId).toBe('b');
  });

  it('defers other projects until the focused one drained plus the quiet period', () => {
    const q = new PrefetchQueue();
    const mine = item('b', '1');
    q.add(item('a', '1'));
    q.add(mine);
    q.focus('b');
    q.remove(q.next(0)!);
    expect(q.next(1_000)).toBeNull();
    expect(q.retryAfter(1_000)).toBe(DEFER_OTHERS_MS);
    expect(q.next(1_000 + DEFER_OTHERS_MS - 1)).toBeNull();
    expect(q.next(1_000 + DEFER_OTHERS_MS)?.projectId).toBe('a');
  });

  it('restarts the quiet period when a focused scene arrives, and clearing focus releases the rest', () => {
    const q = new PrefetchQueue();
    q.add(item('a', '1'));
    q.focus('b');
    expect(q.next(0)).toBeNull();
    q.add(item('b', '2'));
    expect(q.next(5_000)?.projectId).toBe('b');
    q.focus(null);
    q.remove(item('b', '2'));
    expect(q.next(5_000)?.projectId).toBe('a');
  });
});
