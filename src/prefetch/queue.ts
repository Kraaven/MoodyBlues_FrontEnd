/**
 * What the prefetcher still has to download, in order. Pure and clock-injected so the ordering
 * rules are testable.
 *
 * Rules: one entry per scene (a newer revision replaces the older one); the focused project's
 * scenes go first; other projects wait until the focused ones are drained plus a quiet period,
 * so opening a project is never slowed by speculative downloads for another.
 */

export interface PrefetchItem {
  projectId: string;
  sceneId: string;
  /** The scene file URL, which includes the revision hash. */
  url: string;
  sizeBytes: number;
}

export const DEFER_OTHERS_MS = 10_000;

export class PrefetchQueue {
  private items = new Map<string, PrefetchItem>();
  private focused: string | null = null;
  /** When the focused project ran out of scenes; others become eligible DEFER_OTHERS_MS later. */
  private drainedAt: number | null = null;

  get size(): number {
    return this.items.size;
  }

  add(item: PrefetchItem): void {
    const key = `${item.projectId}/${item.sceneId}`;
    // Re-insert so a replaced revision goes to the back like a new entry.
    this.items.delete(key);
    this.items.set(key, item);
    if (item.projectId === this.focused) this.drainedAt = null;
  }

  remove(item: PrefetchItem): void {
    this.items.delete(`${item.projectId}/${item.sceneId}`);
  }

  focus(projectId: string | null): void {
    this.focused = projectId;
    this.drainedAt = null;
  }

  clear(): void {
    this.items.clear();
    this.focused = null;
    this.drainedAt = null;
  }

  /** The next item to download now, or null when nothing is eligible yet. */
  next(now: number): PrefetchItem | null {
    const all = [...this.items.values()];
    if (this.focused) {
      const mine = all.find((i) => i.projectId === this.focused);
      if (mine) return mine;
      this.drainedAt ??= now;
      if (now - this.drainedAt < DEFER_OTHERS_MS) return null;
    }
    return all[0] ?? null;
  }

  /** Milliseconds until `next` may return something, when items are pending but deferred; else null. */
  retryAfter(now: number): number | null {
    if (this.items.size === 0 || this.drainedAt === null) return null;
    return Math.max(0, this.drainedAt + DEFER_OTHERS_MS - now);
  }
}
