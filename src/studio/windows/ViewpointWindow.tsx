import { Clapperboard, Focus, Keyboard, LayoutPanelLeft } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Tooltip } from '../../ui/Tooltip';
import type { Playback } from '../playback';
import { FOV_RANGE, NEAR_RANGE } from '../viewSettings';
import { useLocked, useStudio } from '../studioStore';
import { windowActions } from './windowStore';
import { LockBadge, SectionTitle, WindowBody, WindowFooter } from './parts';
import { CameraTargets, DisplayToggles, LookPicker } from './viewpointControls';

/**
 * Where the view looks from, and how the scene is drawn. A camera the Unity scene exported can be
 * focused, seen through (1st person) or followed from outside; the view then stays on it while it
 * moves through the recording. The display toggles change nothing in the scene's data.
 */
export function ViewpointWindow({ scope, playback }: { scope: string; playback: Playback }) {
  const focusId = useStudio((s) => s.focusCameraId);
  const mode = useStudio((s) => s.cameraMode);
  const settings = useStudio((s) => s.settings);
  const setSetting = useStudio((s) => s.setSetting);
  const recording = useStudio((s) => s.player !== null);
  // What the owner of a shared link locked; the controls the window owns are disabled for their own value.
  const targetLocked = useLocked('cameraTarget');
  const nearLocked = useLocked('firstPersonNear');
  const fovLocked = useLocked('fov');
  const seekLocked = useLocked('seeking');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WindowBody compact>
        <CameraTargets playback={playback} />

        {focusId !== null && mode === 'firstPerson' && (
          <div className="mt-2 flex h-9 items-center gap-3 px-1">
            <label htmlFor="near-clip" className="shrink-0 text-[13px] text-fg-2">
              Near clip
            </label>
            {nearLocked && <LockBadge />}
            <input
              id="near-clip"
              type="range"
              min={NEAR_RANGE.min}
              max={NEAR_RANGE.max}
              step={0.01}
              disabled={nearLocked}
              value={settings.firstPersonNear ?? 0.3}
              onChange={(e) => setSetting('firstPersonNear', Number(e.target.value))}
              className="min-w-0 flex-1"
            />
            {settings.firstPersonNear !== null && <span className="tabular w-11 text-right font-mono text-[13px] text-fg">{settings.firstPersonNear.toFixed(2)}m</span>}
            <Tooltip content="Scale to the player's height">
              <button type="button" aria-pressed={settings.firstPersonNear === null} disabled={nearLocked} onClick={() => setSetting('firstPersonNear', null)} className="h-7 rounded-[6px] px-2 text-[13px] text-fg-2 transition-colors hover:bg-ink-4 hover:text-fg disabled:pointer-events-none disabled:opacity-50">
                Auto
              </button>
            </Tooltip>
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" disabled={targetLocked && focusId !== null} onClick={() => useStudio.getState().frameAll()}>
            <Focus className="h-4 w-4" />
            Frame the scene
            <kbd className="rounded border border-rule-strong bg-ink-1 px-1 font-mono text-[10px] leading-4 text-fg-2">A</kbd>
          </Button>
          {recording && (
            <Button variant="secondary" size="sm" className="flex-1" disabled={seekLocked} onClick={() => useStudio.getState().replayIntro()}>
              <Clapperboard className="h-4 w-4" />
              Replay intro
            </Button>
          )}
        </div>

        <SectionTitle className="mb-1.5 mt-3">Display</SectionTitle>
        <LookPicker />
        <DisplayToggles />
        <div className="mt-1 flex h-8 items-center gap-3 px-1">
          <label htmlFor="fov" className="shrink-0 text-[13px] text-fg-2">
            Field of view
          </label>
          {fovLocked && <LockBadge />}
          <input id="fov" type="range" min={FOV_RANGE.min} max={FOV_RANGE.max} step={1} disabled={fovLocked} value={settings.fov} onChange={(e) => setSetting('fov', Number(e.target.value))} className="min-w-0 flex-1" />
          <span className="tabular w-9 text-right font-mono text-[13px] text-fg">{settings.fov}°</span>
        </div>
      </WindowBody>
      <WindowFooter className="flex-col items-stretch gap-1.5 py-2.5 font-sans text-[12px]">
        <div className="-ml-2 flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => windowActions(scope).reset()}>
            <LayoutPanelLeft className="h-4 w-4" />
            Reset windows
          </Button>
          <Button variant="ghost" size="sm" onClick={() => useStudio.getState().setShortcutsOpen(true)}>
            <Keyboard className="h-4 w-4" />
            Shortcuts
          </Button>
        </div>
        <p>Display only. Scene data is never changed.</p>
      </WindowFooter>
    </div>
  );
}
