/** How long the whole scene is shown before the camera flies in, and how long that flight takes. */
export const INTRO_HOLD_MS = 700;
export const INTRO_FLY_MS = 1600;

/** What the intro does to the studio; the page wires these to the playback clock and the camera. */
export interface IntroActions {
  /** Stop the clock at the start of the recording. */
  pause: () => void;
  /** Cut to the whole scene in view. */
  showScene: () => void;
  /** Move to the framing of the focused camera; 0 cuts. */
  flyToCamera: (durationMs: number) => void;
  /** Start the recording. */
  play: () => void;
}

export type IntroPhase = 'idle' | 'waiting' | 'overview' | 'flying' | 'done';

/**
 * The opening of a recording: paused at the start, the whole scene, a beat, then a flight to the
 * focused camera, and play. A small state machine on timers, with no React and no three.js so the
 * sequencing is tested on its own. Any input, or asking for less motion, goes straight to the end
 * state (camera at its framing, playing); a scene without cameras is framed and played.
 *
 * With `waitForGo` (the welcome card of a shared link) it stops at the overview, paused, until
 * `go()`; input does nothing meanwhile, and `go()` then runs the hold, the flight and play.
 */
export class Intro {
  phase: IntroPhase = 'idle';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private hasCamerasOnGo = true;
  private reducedOnGo = false;

  private readonly actions: IntroActions;
  private readonly onRunning: (running: boolean) => void;

  constructor(actions: IntroActions, onRunning: (running: boolean) => void) {
    this.actions = actions;
    this.onRunning = onRunning;
  }

  get running(): boolean {
    return this.phase === 'waiting' || this.phase === 'overview' || this.phase === 'flying';
  }

  start({ hasCameras, reduced, waitForGo = false }: { hasCameras: boolean; reduced: boolean; waitForGo?: boolean }): void {
    this.cancel();
    this.actions.pause();
    if (waitForGo) {
      this.phase = 'waiting';
      this.onRunning(true);
      this.actions.showScene();
      this.reducedOnGo = reduced;
      this.hasCamerasOnGo = hasCameras;
      return;
    }
    this.run(hasCameras, reduced);
  }

  /** Release a run started with `waitForGo`. Does nothing in any other phase. */
  go(): void {
    if (this.phase !== 'waiting') return;
    this.run(this.hasCamerasOnGo, this.reducedOnGo);
  }

  private run(hasCameras: boolean, reduced: boolean): void {
    const wasRunning = this.running;
    if (!hasCameras) {
      this.actions.showScene();
      this.end(wasRunning);
      return;
    }
    if (reduced) {
      this.actions.flyToCamera(0);
      this.end(wasRunning);
      return;
    }
    this.phase = 'overview';
    if (!wasRunning) this.onRunning(true);
    this.actions.showScene();
    this.timer = setTimeout(() => {
      this.phase = 'flying';
      this.actions.flyToCamera(INTRO_FLY_MS);
      this.timer = setTimeout(() => this.finish(), INTRO_FLY_MS);
    }, INTRO_HOLD_MS);
  }

  /** The end state reached without a flight. */
  private end(wasRunning: boolean): void {
    this.phase = 'done';
    if (wasRunning) this.onRunning(false);
    this.actions.play();
  }

  /** Jump to the end state. Does nothing when the intro is not running, or is waiting for `go()`. */
  skip(): void {
    if (!this.running || this.phase === 'waiting') return;
    this.clear();
    this.actions.flyToCamera(0);
    this.finish();
  }

  /** Leave without finishing: the page is going away, or a new run is about to start. */
  cancel(): void {
    const wasRunning = this.running;
    this.clear();
    this.phase = 'idle';
    if (wasRunning) this.onRunning(false);
  }

  private finish(): void {
    this.timer = null;
    this.phase = 'done';
    this.onRunning(false);
    this.actions.play();
  }

  private clear(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
