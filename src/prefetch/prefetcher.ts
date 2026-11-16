import type { QueryClient } from '@tanstack/react-query';
import { projectQuery, projectsQuery, sceneFilePath } from '../api/queries';
import type { ProjectDetail } from '../api/types';
import { useStage } from '../stage/store';
import { PrefetchQueue, type PrefetchItem } from './queue';
import { sceneCache } from './sceneCache';
import { fetchSceneBytes } from './sceneFetch';

/**
 * Background scene prefetching: once signed in and idle, downloads every project's current,
 * ready scene version into the persistent cache (see sceneCache.ts) so opening one is instant.
 *
 * It is deliberately polite: one download at a time, low fetch priority, a gap between downloads,
 * paused while the user is waiting on a download of their own, skipped entirely on data-saver or
 * slow connections, and never beyond the cache budget. Failures are only logged.
 */

const START_DELAY_MS = 3_000;
const IDLE_TIMEOUT_MS = 5_000;
const GAP_MS = 1_000;

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

function constrainedNetwork(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  return Boolean(connection?.saveData) || connection?.effectiveType === '2g' || connection?.effectiveType === 'slow-2g';
}

function whenIdle(task: () => void): void {
  window.setTimeout(() => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS });
    else task();
  }, START_DELAY_MS);
}

function log(message: string, err?: unknown): void {
  if (import.meta.env.DEV) console.debug(`[prefetch] ${message}`, err ?? '');
}

class Prefetcher {
  private queue = new PrefetchQueue();
  private client: QueryClient | null = null;
  private abort: AbortController | null = null;
  private timer: number | undefined;
  private active = false;
  private busy = false;
  private focusedId: string | null = null;
  /** URLs already handled this session, so a version that cannot be cached is not retried forever. */
  private attempted = new Set<string>();
  private unsubscribers: (() => void)[] = [];
  private requested = new Set<string>();

  /** Begins prefetching for the signed-in user. A no-op when already running or on a constrained network. */
  start(client: QueryClient): void {
    if (this.active || constrainedNetwork()) return;
    this.active = true;
    this.client = client;
    this.abort = new AbortController();

    const cache = client.getQueryCache();
    this.unsubscribers.push(
      cache.subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'success') return;
        const [kind, id] = event.query.queryKey;
        if (kind === 'project' && typeof id === 'string') this.enqueueProject(event.query.state.data as ProjectDetail | undefined);
        else if (kind === 'projects' && event.query.queryKey.length === 1) this.requestProjects(event.query.state.data as { id: string }[] | undefined);
      }),
      // Resume when the user's own downloads finish.
      useStage.subscribe((state, prev) => {
        if (Object.keys(state.loading).length === 0 && Object.keys(prev.loading).length > 0) this.schedule(GAP_MS);
      }),
    );

    whenIdle(() => {
      if (!this.active) return;
      void this.discover();
    });
  }

  /** Stops, aborts any download in flight and forgets everything (sign-out). */
  stop(): void {
    this.active = false;
    this.abort?.abort();
    this.abort = null;
    window.clearTimeout(this.timer);
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this.queue.clear();
    this.attempted.clear();
    this.requested.clear();
    this.focusedId = null;
    this.client = null;
    this.busy = false;
  }

  /** The user opened a project (or a scene or session in it): its scenes go first. Null on the lobby. */
  focus(projectId: string | null): void {
    this.focusedId = projectId;
    this.queue.focus(projectId);
    if (this.active) this.schedule(0);
  }

  status(): { pending: number; downloading: boolean } {
    return { pending: this.queue.size, downloading: this.busy };
  }

  private async discover(): Promise<void> {
    const client = this.client;
    if (!client) return;
    try {
      this.requestProjects(await client.fetchQuery(projectsQuery()));
    } catch (err) {
      log('could not list projects', err);
    }
  }

  /** Loads each project's detail (which also warms the pages' own cache); enqueueing happens in the cache subscription. */
  private requestProjects(list: { id: string }[] | undefined): void {
    const client = this.client;
    if (!client || !list) return;
    const ids = list.map((p) => p.id).filter((id) => !this.requested.has(id));
    ids.sort((a, b) => Number(b === this.focusedId) - Number(a === this.focusedId));
    for (const id of ids) {
      this.requested.add(id);
      client.fetchQuery({ ...projectQuery(id), staleTime: 60_000 }).catch((err) => log(`could not load project ${id}`, err));
    }
  }

  private enqueueProject(project: ProjectDetail | undefined): void {
    if (!this.active || !project) return;
    for (const scene of project.scenes) {
      if (scene.processingStatus !== 'Ready' || scene.sizeBytes <= 0) continue;
      const url = sceneFilePath(project.id, scene.sceneId, scene.latestHash);
      if (this.attempted.has(url)) continue;
      this.queue.add({ projectId: project.id, sceneId: scene.sceneId, url, sizeBytes: scene.sizeBytes });
    }
    this.schedule(GAP_MS);
  }

  private schedule(delayMs: number): void {
    if (!this.active) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.tick(), delayMs);
  }

  private async tick(): Promise<void> {
    if (!this.active || this.busy) return;
    if (Object.keys(useStage.getState().loading).length > 0) return; // resumed by the store subscription

    const item = this.queue.next(Date.now());
    if (!item) {
      const wait = this.queue.retryAfter(Date.now());
      if (wait !== null) this.schedule(wait + 50);
      return;
    }
    this.queue.remove(item);
    this.busy = true;
    try {
      await this.download(item);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) log(`download failed: ${item.url}`, err);
    } finally {
      this.busy = false;
      this.schedule(GAP_MS);
    }
  }

  private async download(item: PrefetchItem): Promise<void> {
    this.attempted.add(item.url);
    if (await sceneCache.has(item.url)) return;
    if (!(await sceneCache.canFit(item.sizeBytes))) return;
    await fetchSceneBytes(item.url, undefined, this.abort?.signal, true);
  }
}

export const prefetcher = new Prefetcher();
