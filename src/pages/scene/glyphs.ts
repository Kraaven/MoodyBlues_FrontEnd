import { useCallback, useEffect, useRef, useState } from 'react';
import { createStore, del, entries, get, set } from 'idb-keyval';
import { downloadWithProgress } from '../../api/queries';
import type { SessionSummary } from '../../api/types';
import { computeGlyphTimeline, type GlyphTimeline } from '../../viewer/replay/glyphTimeline';
import { parseReplay } from '../../viewer/replay/replayFile';

/**
 * The timeline form of each session's glyph (DESIGN.md 7.6), kept in this browser.
 *
 * The session list carries counts but not when things happened, and the backend is not being changed,
 * so the real shape can only come from the replay file itself. It is computed the first time a replay
 * is read here (by opening the session, or by the opt-in indexer below) and stored in IndexedDB.
 * A session nobody has read here shows its honest summary form instead.
 *
 * The key includes the replay's size and keyframe count, so a rebuild that changes the replay
 * invalidates the old glyph. A rebuild that produced an identical replay keeps it, which is correct.
 */

const store = createStore('moodyblues-glyphs', 'glyphs');
const MAX_GLYPHS = 400;

/** The fields of a session (summary or detail) that identify the replay a glyph was drawn from. */
export interface GlyphKey {
  id: string;
  replaySizeBytes: number;
  keyframeCount: number;
}

interface Stored {
  timeline: GlyphTimeline;
  at: number;
}

const cacheKey = (s: GlyphKey) => `${s.id}:${s.replaySizeBytes}:${s.keyframeCount}`;
const memory = new Map<string, GlyphTimeline>();
const listeners = new Set<() => void>();

async function load(session: GlyphKey): Promise<GlyphTimeline | null> {
  const key = cacheKey(session);
  const known = memory.get(key);
  if (known) return known;
  try {
    const stored = await get<Stored>(key, store);
    if (!stored) return null;
    memory.set(key, stored.timeline);
    return stored.timeline;
  } catch {
    return null;
  }
}

/** Remembers the timeline form for a session whose replay has just been read. */
export async function saveGlyph(session: GlyphKey, timeline: GlyphTimeline): Promise<void> {
  const key = cacheKey(session);
  memory.set(key, timeline);
  listeners.forEach((l) => l());
  try {
    await set(key, { timeline, at: Date.now() } satisfies Stored, store);
    const all = await entries<string, Stored>(store);
    if (all.length > MAX_GLYPHS) {
      all.sort((a, b) => a[1].at - b[1].at);
      for (const [oldKey] of all.slice(0, all.length - MAX_GLYPHS)) {
        await del(oldKey, store);
        memory.delete(String(oldKey));
      }
    }
  } catch {
    // No storage: the glyph lasts for this visit only.
  }
}

/** The timeline forms this browser has for these sessions, by session id. */
export function useGlyphTimelines(sessions: SessionSummary[]): Map<string, GlyphTimeline> {
  const [found, setFound] = useState<Map<string, GlyphTimeline>>(() => new Map());

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const next = new Map<string, GlyphTimeline>();
      await Promise.all(
        sessions
          .filter((s) => s.status === 'Ready')
          .map(async (s) => {
            const timeline = await load(s);
            if (timeline) next.set(s.id, timeline);
          }),
      );
      if (alive) setFound(next);
    };
    void refresh();
    listeners.add(refresh as () => void);
    return () => {
      alive = false;
      listeners.delete(refresh as () => void);
    };
  }, [sessions]);

  return found;
}

export interface IndexerState {
  running: boolean;
  done: number;
  total: number;
  failed: number;
}

/**
 * The opt-in "Index sessions" action: reads the replays of sessions that only have a summary, one at
 * a time, and stores each one's timeline. Never starts by itself, reports progress, and can be
 * cancelled between (or during) downloads without leaving partial state: a glyph is stored only once
 * its replay has been fully read.
 */
export function useSessionIndexer(missing: SessionSummary[]) {
  const [state, setState] = useState<IndexerState>({ running: false, done: 0, total: 0, failed: 0 });
  const controller = useRef<AbortController | null>(null);

  const cancel = useCallback(() => controller.current?.abort(), []);
  useEffect(() => () => controller.current?.abort(), []);

  const start = useCallback(async () => {
    if (controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    const queue = [...missing];
    setState({ running: true, done: 0, total: queue.length, failed: 0 });
    let done = 0;
    let failed = 0;
    for (const session of queue) {
      if (abort.signal.aborted) break;
      try {
        const buffer = await downloadWithProgress(`/api/sessions/${encodeURIComponent(session.id)}/replay`, undefined, abort.signal);
        const started = performance.now();
        const timeline = computeGlyphTimeline(parseReplay(buffer));
        const took = performance.now() - started;
        if (took > 50) console.debug(`[glyphs] parsing ${session.id.slice(0, 8)} blocked the page for ${took.toFixed(0)} ms`);
        await saveGlyph(session, timeline);
        done += 1;
      } catch (err) {
        if (abort.signal.aborted) break;
        failed += 1;
        console.debug('[glyphs] could not read a replay:', err);
      }
      setState({ running: true, done, total: queue.length, failed });
      // Let the page paint between sessions.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    controller.current = null;
    setState({ running: false, done, total: queue.length, failed });
  }, [missing]);

  return { state, start, cancel };
}
