import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Intro, INTRO_FLY_MS, INTRO_HOLD_MS } from './intro';

function setup() {
  const calls: string[] = [];
  const intro = new Intro(
    {
      pause: () => calls.push('pause'),
      showScene: () => calls.push('scene'),
      flyToCamera: (ms) => calls.push(`fly:${ms}`),
      play: () => calls.push('play'),
    },
    (running) => calls.push(running ? 'running' : 'idle'),
  );
  return { intro, calls };
}

describe('Intro', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('pauses, shows the scene, holds, flies, then plays', () => {
    const { intro, calls } = setup();
    intro.start({ hasCameras: true, reduced: false });
    expect(calls).toEqual(['pause', 'running', 'scene']);
    vi.advanceTimersByTime(INTRO_HOLD_MS - 1);
    expect(calls).not.toContain(`fly:${INTRO_FLY_MS}`);
    vi.advanceTimersByTime(1);
    expect(calls.at(-1)).toBe(`fly:${INTRO_FLY_MS}`);
    expect(intro.phase).toBe('flying');
    vi.advanceTimersByTime(INTRO_FLY_MS);
    expect(calls.slice(-2)).toEqual(['idle', 'play']);
    expect(intro.phase).toBe('done');
    expect(intro.running).toBe(false);
  });

  it('skips to the end state on input, and only once', () => {
    const { intro, calls } = setup();
    intro.start({ hasCameras: true, reduced: false });
    vi.advanceTimersByTime(100);
    intro.skip();
    expect(calls.slice(-3)).toEqual(['fly:0', 'idle', 'play']);
    const length = calls.length;
    intro.skip();
    vi.advanceTimersByTime(10_000);
    expect(calls).toHaveLength(length);
  });

  it('skips from the middle of the flight', () => {
    const { intro, calls } = setup();
    intro.start({ hasCameras: true, reduced: false });
    vi.advanceTimersByTime(INTRO_HOLD_MS + 200);
    intro.skip();
    expect(calls.slice(-3)).toEqual(['fly:0', 'idle', 'play']);
    vi.advanceTimersByTime(10_000);
    expect(calls.filter((c) => c === 'play')).toHaveLength(1);
  });

  it('cuts straight to the camera with reduced motion', () => {
    const { intro, calls } = setup();
    intro.start({ hasCameras: true, reduced: true });
    expect(calls).toEqual(['pause', 'fly:0', 'play']);
    expect(intro.running).toBe(false);
  });

  it('frames the scene and plays when there are no cameras', () => {
    const { intro, calls } = setup();
    intro.start({ hasCameras: false, reduced: false });
    expect(calls).toEqual(['pause', 'scene', 'play']);
  });

  it('cancels its timers when the page goes away', () => {
    const { intro, calls } = setup();
    intro.start({ hasCameras: true, reduced: false });
    intro.cancel();
    vi.advanceTimersByTime(10_000);
    expect(calls).toEqual(['pause', 'running', 'scene', 'idle']);
    expect(intro.phase).toBe('idle');
  });

  it('starting again replaces a run in progress', () => {
    const { intro, calls } = setup();
    intro.start({ hasCameras: true, reduced: false });
    vi.advanceTimersByTime(300);
    intro.start({ hasCameras: true, reduced: false });
    vi.advanceTimersByTime(INTRO_HOLD_MS + INTRO_FLY_MS);
    expect(calls.filter((c) => c === 'play')).toHaveLength(1);
    expect(calls.filter((c) => c === `fly:${INTRO_FLY_MS}`)).toHaveLength(1);
  });

  describe('waiting for go', () => {
    it('stops at the overview, paused, and does nothing until released', () => {
      const { intro, calls } = setup();
      intro.start({ hasCameras: true, reduced: false, waitForGo: true });
      expect(calls).toEqual(['pause', 'running', 'scene']);
      expect(intro.phase).toBe('waiting');
      expect(intro.running).toBe(true);
      vi.advanceTimersByTime(60_000);
      expect(calls).toEqual(['pause', 'running', 'scene']);
    });

    it('ignores skip while waiting', () => {
      const { intro, calls } = setup();
      intro.start({ hasCameras: true, reduced: false, waitForGo: true });
      intro.skip();
      expect(calls).toEqual(['pause', 'running', 'scene']);
      expect(intro.phase).toBe('waiting');
    });

    it('go() holds, flies, then plays', () => {
      const { intro, calls } = setup();
      intro.start({ hasCameras: true, reduced: false, waitForGo: true });
      intro.go();
      expect(intro.phase).toBe('overview');
      vi.advanceTimersByTime(INTRO_HOLD_MS);
      expect(calls.at(-1)).toBe(`fly:${INTRO_FLY_MS}`);
      vi.advanceTimersByTime(INTRO_FLY_MS);
      expect(calls.slice(-2)).toEqual(['idle', 'play']);
      expect(calls.filter((c) => c === 'running')).toHaveLength(1);
      expect(intro.phase).toBe('done');
    });

    it('go() can be skipped once released, and only plays once', () => {
      const { intro, calls } = setup();
      intro.start({ hasCameras: true, reduced: false, waitForGo: true });
      intro.go();
      intro.skip();
      vi.advanceTimersByTime(10_000);
      intro.go();
      expect(calls.filter((c) => c === 'play')).toHaveLength(1);
    });

    it('go() cuts to the camera with reduced motion, and frames a scene without cameras', () => {
      const a = setup();
      a.intro.start({ hasCameras: true, reduced: true, waitForGo: true });
      a.intro.go();
      expect(a.calls).toEqual(['pause', 'running', 'scene', 'fly:0', 'idle', 'play']);
      const b = setup();
      b.intro.start({ hasCameras: false, reduced: false, waitForGo: true });
      b.intro.go();
      expect(b.calls).toEqual(['pause', 'running', 'scene', 'scene', 'idle', 'play']);
    });

    it('go() does nothing when the run was not waiting, and cancel leaves cleanly', () => {
      const { intro, calls } = setup();
      intro.go();
      intro.start({ hasCameras: true, reduced: false });
      intro.go();
      expect(calls).toEqual(['pause', 'running', 'scene']);
      intro.cancel();
      const w = setup();
      w.intro.start({ hasCameras: true, reduced: false, waitForGo: true });
      w.intro.cancel();
      w.intro.go();
      expect(w.calls.at(-1)).toBe('idle');
    });
  });
});
