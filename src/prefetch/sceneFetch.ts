import { downloadResource } from '../api/queries';
import { isCacheableSceneUrl, sceneCache } from './sceneCache';

type Progress = (received: number, total: number | null) => void;

/**
 * One scene download in progress. The foreground load and the background prefetcher can both want
 * the same URL; they share the flight instead of downloading twice, and the foreground sees its
 * progress. The download is abandoned only when every participant has aborted.
 */
interface Flight {
  promise: Promise<ArrayBuffer>;
  controller: AbortController;
  participants: number;
  listeners: Set<Progress>;
  last: { received: number; total: number | null } | null;
}

const flights = new Map<string, Flight>();

function start(url: string, priority: 'low' | undefined): Flight {
  const controller = new AbortController();
  const flight: Flight = { promise: Promise.resolve(new ArrayBuffer(0)), controller, participants: 0, listeners: new Set(), last: null };
  flight.promise = (async () => {
    try {
      const { buffer, immutable } = await downloadResource(
        url,
        (received, total) => {
          flight.last = { received, total };
          flight.listeners.forEach((l) => l(received, total));
        },
        controller.signal,
        priority,
      );
      // Only a final revision is kept: while the backend still serves the raw fallback, the
      // optimized file will be a different download under the same URL.
      if (immutable && isCacheableSceneUrl(url)) await sceneCache.put(url, buffer);
      return buffer;
    } finally {
      flights.delete(url);
    }
  })();
  flights.set(url, flight);
  return flight;
}

/**
 * A scene's GLB bytes: from the persistent cache when present, otherwise downloaded (and cached
 * when final). `background` marks prefetching, which asks the browser for low fetch priority.
 */
export async function fetchSceneBytes(
  url: string,
  onProgress?: Progress,
  signal?: AbortSignal,
  background = false,
): Promise<ArrayBuffer> {
  const cacheable = isCacheableSceneUrl(url);
  if (cacheable) {
    const cached = await sceneCache.get(url);
    if (cached) {
      onProgress?.(cached.byteLength, cached.byteLength);
      return cached;
    }
  }
  signal?.throwIfAborted();

  const flight = flights.get(url) ?? start(url, background ? 'low' : undefined);
  flight.participants++;
  if (onProgress) {
    flight.listeners.add(onProgress);
    if (flight.last) onProgress(flight.last.received, flight.last.total);
  }

  return new Promise<ArrayBuffer>((resolve, reject) => {
    let left = false;
    const leave = () => {
      if (left) return;
      left = true;
      signal?.removeEventListener('abort', onAbort);
      if (onProgress) flight.listeners.delete(onProgress);
      if (--flight.participants === 0) flight.controller.abort();
    };
    const onAbort = () => {
      leave();
      reject(signal!.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    flight.promise.then(
      (buffer) => {
        leave();
        resolve(buffer);
      },
      (err) => {
        leave();
        reject(err);
      },
    );
  });
}
