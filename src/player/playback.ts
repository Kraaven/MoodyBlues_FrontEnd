import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { ReplayPlayer } from '../viewer/replay/ReplayPlayer';

/** One capture tick at the client's default 40 Hz: the frame-step size. */
export const TICK_SECONDS = 1 / 40;

export const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

type FrameListener = (time: number) => void;

/**
 * The playback clock, outside React (DESIGN.md 15): the viewport advances it every frame, and the
 * playhead and time readouts subscribe to it and update the DOM directly. React state only
 * changes on user actions, or through {@link usePlaybackTime} at a low rate.
 */
export class Playback {
  player: ReplayPlayer | null = null;
  duration = 0;
  time = 0;
  playing = true;
  speed = 1;
  private readonly listeners = new Set<FrameListener>();
  private readonly stateListeners = new Set<() => void>();

  attach(player: ReplayPlayer | null): void {
    this.player = player;
    if (player) {
      this.duration = player.duration;
      player.seek(this.time);
    }
    this.emitState();
  }

  /** Called by the viewport once per rendered frame. */
  advance(deltaSeconds: number): void {
    const player = this.player;
    if (!player) return;
    player.playing = this.playing;
    player.speed = this.speed;
    player.update(deltaSeconds);
    this.time = player.currentTime;
    if (this.playing && !player.playing) {
      this.playing = false;
      this.emitState();
    }
    for (const listener of this.listeners) listener(this.time);
  }

  seek(time: number): void {
    this.time = Math.min(Math.max(time, 0), this.duration || time);
    this.player?.seek(this.time);
    for (const listener of this.listeners) listener(this.time);
  }

  setPlaying(playing: boolean): void {
    // Pressing play at the end starts again from the beginning.
    if (playing && this.duration > 0 && this.time >= this.duration) this.seek(0);
    this.playing = playing;
    this.emitState();
  }

  toggle(): void {
    this.setPlaying(!this.playing);
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.emitState();
  }

  /** Per-frame time updates. */
  subscribe(listener: FrameListener): () => void {
    this.listeners.add(listener);
    listener(this.time);
    return () => this.listeners.delete(listener);
  }

  /** Play state, speed and attachment changes. */
  subscribeState(listener: () => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  private emitState(): void {
    for (const listener of this.stateListeners) listener();
  }
}

/** The playhead time as React state, at most `hz` times a second. */
export function usePlaybackTime(playback: Playback, hz = 10): number {
  const [time, setTime] = useState(playback.time);
  useEffect(() => {
    let last = 0;
    return playback.subscribe((t) => {
      const now = performance.now();
      if (now - last >= 1000 / hz) {
        last = now;
        setTime(t);
      }
    });
  }, [playback, hz]);
  return time;
}

/** Re-renders on play/pause, speed and player attachment. */
export function usePlaybackState(playback: Playback): { playing: boolean; speed: number; ready: boolean; duration: number } {
  const [, force] = useState(0);
  useEffect(() => playback.subscribeState(() => force((n) => n + 1)), [playback]);
  return { playing: playback.playing, speed: playback.speed, ready: playback.player !== null, duration: playback.duration };
}

const LOGS_ON_TRACK_KEY = 'moodyblues.logsOnTrack';

function readStored<T>(key: string, fallback: T, parse: (v: string) => T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : parse(v);
  } catch {
    return fallback;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable: the setting lasts for this visit only.
  }
}

interface PlayerUiState {
  selectedId: number | null;
  follow: boolean;
  logsOnTrack: boolean;
  showGrid: boolean;
  /** Bumped to ask the viewport to frame the whole scene / the selection. */
  frameAllRequest: number;
  frameSelectedRequest: number;
  shortcutsOpen: boolean;
  select: (id: number | null) => void;
  setFollow: (follow: boolean) => void;
  setLogsOnTrack: (on: boolean) => void;
  toggleGrid: () => void;
  frameAll: () => void;
  frameSelected: () => void;
  setShortcutsOpen: (open: boolean) => void;
  reset: () => void;
}

/** What the person watching has chosen: the selection, the camera helpers and the dialogs. Panel layout lives in src/panels. */
export const usePlayerUi = create<PlayerUiState>((set) => ({
  selectedId: null,
  follow: false,
  logsOnTrack: readStored(LOGS_ON_TRACK_KEY, true, (v) => v !== 'false'),
  showGrid: true,
  frameAllRequest: 0,
  frameSelectedRequest: 0,
  shortcutsOpen: false,
  select: (selectedId) => set((s) => ({ selectedId, follow: selectedId === null ? false : s.follow })),
  setFollow: (follow) => set({ follow }),
  setLogsOnTrack: (logsOnTrack) => {
    store(LOGS_ON_TRACK_KEY, String(logsOnTrack));
    set({ logsOnTrack });
  },
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  frameAll: () => set((s) => ({ frameAllRequest: s.frameAllRequest + 1 })),
  frameSelected: () => set((s) => ({ frameSelectedRequest: s.frameSelectedRequest + 1 })),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
  reset: () => set({ selectedId: null, follow: false, shortcutsOpen: false }),
}));