import { useMemo, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Axis3d, Clapperboard, Cuboid, Focus, Grid3x3, Keyboard, LayoutPanelLeft, Lightbulb, Navigation, ScanEye, SunMedium, Video } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Tooltip } from '../../ui/Tooltip';
import { cn } from '../../ui/cn';
import { ReplayPlayer } from '../../viewer/replay/ReplayPlayer';
import { listCameras, MAIN_CAMERA_TAG } from '../cameras';
import { usePlaybackTime, type Playback } from '../playback';
import { useStudio, type CameraMode, type FollowStyle, type ViewSettings } from '../studioStore';
import { windowActions } from './windowStore';
import { SectionTitle, WindowBody, WindowFooter } from './parts';

type ToggleKey = { [K in keyof ViewSettings]: ViewSettings[K] extends boolean ? K : never }[keyof ViewSettings];

const TOGGLES: { key: ToggleKey; label: string; icon: LucideIcon }[] = [
  { key: 'grid', label: 'Grid', icon: Grid3x3 },
  { key: 'shadows', label: 'Shadows', icon: SunMedium },
  { key: 'wireframe', label: 'Wireframe', icon: Cuboid },
  { key: 'axes', label: 'Axes', icon: Axis3d },
  { key: 'sceneLights', label: 'Scene lights', icon: Lightbulb },
  { key: 'cameraGizmos', label: 'Camera lines', icon: Video },
];

const MODES: { mode: CameraMode; label: string; tip: string; icon: LucideIcon }[] = [
  { mode: 'firstPerson', label: '1st person', tip: '1st person (P)', icon: ScanEye },
  { mode: 'follow', label: 'Follow', tip: 'Follow', icon: Navigation },
];

const FOLLOW_STYLES: { style: FollowStyle; label: string; hint: string }[] = [
  { style: 'behind', label: 'Behind', hint: 'Chases from behind and above.' },
  { style: 'front', label: 'Front', hint: 'Side-on, leading where they move.' },
];

/**
 * Where the view looks from, and how the scene is drawn. A camera the Unity scene exported can be
 * focused, seen through (1st person) or followed from outside; the view then stays on it while it
 * moves through the recording. The display toggles change nothing in the scene's data.
 */
export function ViewpointWindow({ scope, playback }: { scope: string; playback: Playback }) {
  const root = useStudio((s) => s.root);
  const focusId = useStudio((s) => s.focusCameraId);
  const mode = useStudio((s) => s.cameraMode);
  const settings = useStudio((s) => s.settings);
  const setSetting = useStudio((s) => s.setSetting);
  const recording = useStudio((s) => s.player !== null);
  const cameras = useMemo(() => (root ? listCameras(root) : []), [root]);
  // Whether a camera is switched on changes as the recording plays; a few times a second is enough.
  usePlaybackTime(playback, 4);
  
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WindowBody compact>
        <SectionTitle className="mb-1.5">Cameras</SectionTitle>
        {cameras.length === 0 ? (
          <p className="text-[13px] leading-5 text-fg-2">No cameras in this export. Re-export the scene from Unity (MoodyBlues &gt; Export This Scene).</p>
        ) : (
          <div role="group" aria-label="Cameras" className="space-y-0.5">
            {cameras.map((c) => {
              const focused = focusId === c.id;
              const inactive = !ReplayPlayer.isEffectivelyVisible(c.node);
              return (
                <Row key={c.id} selected={focused}>
                  <button type="button" aria-pressed={focused} onClick={() => useStudio.getState().setCameraMode(c.id, 'follow')} className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-[6px] pl-2.5 text-left">
                    <Video className={cn('h-4 w-4 shrink-0', focused ? 'text-accent' : 'text-fg-3')} strokeWidth={1.6} />
                    <span className="min-w-0 truncate text-[14px] text-fg">{c.name}</span>
                    {c.tag === MAIN_CAMERA_TAG && <span className="shrink-0 rounded-[4px] bg-accent/16 px-1.5 py-0.5 text-[11px] font-medium leading-none text-accent">Main</span>}
                    {inactive && <span className="shrink-0 text-[11px] text-fg-3">inactive</span>}
                  </button>
                  <div role="radiogroup" aria-label={`${c.name} view`} className="flex shrink-0 gap-0.5 rounded-[7px] bg-ink-1/70 p-0.5">
                    {MODES.map((m) => {
                      const on = focused && mode === m.mode;
                      return (
                        <Tooltip key={m.mode} content={m.tip}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={on}
                            aria-label={m.label}
                            onClick={() => useStudio.getState().setCameraMode(c.id, m.mode)}
                            className={cn('inline-flex h-7 w-7 items-center justify-center rounded-[5px] transition-colors', on ? 'bg-accent/18 text-accent' : 'text-fg-2 hover:bg-ink-4 hover:text-fg')}
                          >
                            <m.icon className="h-4 w-4" strokeWidth={1.7} />
                          </button>
                        </Tooltip>
                      );
                    })}
                  </div>
                </Row>
              );
            })}
            <Row selected={focusId === null}>
              <button type="button" aria-pressed={focusId === null} onClick={() => useStudio.getState().setFocusCamera(null)} className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-[6px] pl-2.5 text-left">
                <Video className={cn('h-4 w-4 shrink-0', focusId === null ? 'text-accent' : 'text-fg-3')} strokeWidth={1.6} />
                <span className="min-w-0 truncate text-[14px] text-fg">Free camera</span>
              </button>
            </Row>
          </div>
        )}

        {focusId !== null && mode === 'follow' && (
          <div className="mt-2 flex h-9 items-center justify-between gap-3 px-1">
            <span className="text-[13px] text-fg-2">Follow style</span>
            <div role="radiogroup" aria-label="Follow style" className="flex w-40 gap-0.5 rounded-[8px] bg-ink-1/70 p-0.5">
              {FOLLOW_STYLES.map((f) => (
                <Tooltip key={f.style} content={f.hint}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={settings.followStyle === f.style}
                    onClick={() => setSetting('followStyle', f.style)}
                    className={cn('h-7 flex-1 rounded-[6px] text-[13px] transition-colors', settings.followStyle === f.style ? 'bg-accent/18 text-accent' : 'text-fg-2 hover:bg-ink-4 hover:text-fg')}
                  >
                    {f.label}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>
        )}

        {focusId !== null && mode === 'firstPerson' && (
          <div className="mt-2 flex h-9 items-center gap-3 px-1">
            <label htmlFor="near-clip" className="shrink-0 text-[13px] text-fg-2">
              Near clip
            </label>
            <input
              id="near-clip"
              type="range"
              min={0.01}
              max={1.5}
              step={0.01}
              value={settings.firstPersonNear ?? 0.3}
              onChange={(e) => setSetting('firstPersonNear', Number(e.target.value))}
              className="min-w-0 flex-1"
            />
            {settings.firstPersonNear !== null && <span className="tabular w-11 text-right font-mono text-[13px] text-fg">{settings.firstPersonNear.toFixed(2)}m</span>}
            <Tooltip content="Scale to the player's height">
              <button type="button" aria-pressed={settings.firstPersonNear === null} onClick={() => setSetting('firstPersonNear', null)} className="h-7 rounded-[6px] px-2 text-[13px] text-fg-2 transition-colors hover:bg-ink-4 hover:text-fg">
                Auto
              </button>
            </Tooltip>
          </div>
        )}

        <div className="mt-2 flex gap-2">
          <Button variant="secondary" size="sm" className="flex-1" onClick={() => useStudio.getState().frameAll()}>
            <Focus className="h-4 w-4" />
            Frame the scene
            <kbd className="rounded border border-rule-strong bg-ink-1 px-1 font-mono text-[10px] leading-4 text-fg-2">A</kbd>
          </Button>
          {recording && (
            <Button variant="secondary" size="sm" className="flex-1" onClick={() => useStudio.getState().replayIntro()}>
              <Clapperboard className="h-4 w-4" />
              Replay intro
            </Button>
          )}
        </div>

        <SectionTitle className="mb-1.5 mt-3">Display</SectionTitle>
        <div className="grid grid-cols-2 gap-1.5">
          {TOGGLES.map((t) => {
            const on = settings[t.key];
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={on}
                onClick={() => setSetting(t.key, !on)}
                className={cn(
                  'flex h-8 items-center gap-2 rounded-[8px] border px-2.5 text-left text-[13px] transition-colors',
                  on ? 'border-accent/40 bg-accent/12 text-accent' : 'border-rule bg-ink-3/50 text-fg-2 hover:border-rule-strong hover:text-fg',
                )}
              >
                <t.icon className="h-4 w-4 shrink-0" strokeWidth={1.6} />
                <span className="truncate">{t.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-1 flex h-8 items-center gap-3 px-1">
          <label htmlFor="fov" className="shrink-0 text-[13px] text-fg-2">
            Field of view
          </label>
          <input id="fov" type="range" min={20} max={90} step={1} value={settings.fov} onChange={(e) => setSetting('fov', Number(e.target.value))} className="min-w-0 flex-1" />
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

function Row({ selected, children }: { selected: boolean; children: ReactNode }) {
  return <div className={cn('flex h-9 items-center gap-2 rounded-[8px] pr-1 transition-colors', selected ? 'bg-ink-3 ring-1 ring-accent/50' : 'hover:bg-ink-3/60')}>{children}</div>;
}
