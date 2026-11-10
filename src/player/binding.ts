import { create } from 'zustand';
import type { Replay } from '../viewer/replay/replayFile';
import type { Playback } from './playback';

/**
 * What the Stage should play. The session page puts the parsed replay and its clock here; the
 * Stage's replay content (a lazy chunk inside the canvas) picks them up. Kept out of the Stage's own
 * store because a parsed replay is large and is not part of describing a view.
 */
interface ReplayBinding {
  replay: Replay | null;
  playback: Playback | null;
  bind: (replay: Replay | null, playback: Playback | null) => void;
}

export const useReplayBinding = create<ReplayBinding>((set) => ({
  replay: null,
  playback: null,
  bind: (replay, playback) => set({ replay, playback }),
}));
