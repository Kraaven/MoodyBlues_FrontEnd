import { useMemo, type ReactNode } from 'react';
import { Clapperboard, Keyboard, LayoutPanelLeft, Video } from 'lucide-react';
import { Button } from '../../ui/Button';
import { Tag } from '../../ui/Chip';
import { Toggle } from '../../ui/Field';
import { cn } from '../../ui/cn';
import { ReplayPlayer } from '../../viewer/replay/ReplayPlayer';
import { listCameras, MAIN_CAMERA_TAG } from '../cameras';
import { usePlaybackTime, type Playback } from '../playback';
import { useStudio, type ViewSettings } from '../studioStore';
import { windowActions } from './windowStore';
import { Rule, SectionTitle, WindowBody, WindowFooter } from './parts';

type ToggleKey = { [K in keyof ViewSettings]: ViewSettings[K] extends boolean ? K : never }[keyof ViewSettings];

const TOGGLES: { key: ToggleKey; label: string }[] = [
  { key: 'grid', label: 'Grid' },
  { key: 'shadows', label: 'Shadows' },
  { key: 'wireframe', label: 'Wireframe' },
  { key: 'axes', label: 'Axis helper' },
  { key: 'sceneLights', label: 'Scene lights' },
  { key: 'cameraGizmos', label: 'Camera gizmos' },
];

/**
 * Where the view looks from, and how the scene is drawn. A camera the Unity scene exported can be
 * focused: the view then stays on it, orbiting around it while it moves through the recording. The
 * display toggles change nothing in the scene's data.
 */
export function ViewpointWindow({ scope, playback }: { scope: string; playback: Playback }) {
  const root = useStudio((s) => s.root);
  const focusId = useStudio((s) => s.focusCameraId);
  const setFocus = useStudio((s) => s.setFocusCamera);
  const settings = useStudio((s) => s.settings);
  const setSetting = useStudio((s) => s.setSetting);
  const recording = useStudio((s) => s.player !== null);
  const cameras = useMemo(() => (root ? listCameras(root) : []), [root]);
  // Whether a camera is switched on changes as the recording plays; a few times a second is enough.
  usePlaybackTime(playback, 4);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WindowBody>
        <SectionTitle>Cameras</SectionTitle>
        {cameras.length === 0 ? (
          <p className="text-[14px] leading-6 text-fg-2">No cameras in this export — re-export the scene from Unity (MoodyBlues &gt; Export This Scene).</p>
        ) : (
          <div role="radiogroup" aria-label="Camera" className="space-y-1">
            {cameras.map((c) => {
              const inactive = !ReplayPlayer.isEffectivelyVisible(c.node);
              return (
                <CameraRow key={c.id} selected={focusId === c.id} onSelect={() => setFocus(c.id)}>
                  <Video className="h-[18px] w-[18px] shrink-0 text-fg-3" strokeWidth={1.6} />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-fg">{c.name}</span>
                  {c.tag === MAIN_CAMERA_TAG && <Tag tone="accent">Main</Tag>}
                  {inactive && <span className="text-[12px] text-fg-3">inactive</span>}
                </CameraRow>
              );
            })}
            <CameraRow selected={focusId === null} onSelect={() => setFocus(null)}>
              <span className="min-w-0 flex-1 truncate text-[15px] text-fg">Free camera</span>
            </CameraRow>
          </div>
        )}
        {recording && (
          <div className="mt-4">
            <Button variant="secondary" size="sm" onClick={() => useStudio.getState().replayIntro()}>
              <Clapperboard className="h-4 w-4" />
              Replay intro
            </Button>
          </div>
        )}
        <Rule />
        <SectionTitle>Display</SectionTitle>
        <div className="space-y-1">
          {TOGGLES.map((t) => (
            <label key={t.key} className="flex h-12 cursor-pointer items-center justify-between">
              <span className="text-[15px] text-fg">{t.label}</span>
              <Toggle checked={settings[t.key]} onChange={(v) => setSetting(t.key, v)} label={t.label} />
            </label>
          ))}
        </div>
        <div className="flex h-12 items-center justify-between gap-6">
          <label htmlFor="fov" className="shrink-0 text-[15px] text-fg-2">
            Field of view
          </label>
          <input
            id="fov"
            type="range"
            min={20}
            max={90}
            step={1}
            value={settings.fov}
            onChange={(e) => setSetting('fov', Number(e.target.value))}
            className="min-w-0 flex-1"
          />
          <span className="tabular w-10 text-right font-mono text-[14px] text-fg">{settings.fov}°</span>
        </div>
        <Rule />
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => windowActions(scope).reset()}>
            <LayoutPanelLeft className="h-4 w-4" />
            Reset windows
          </Button>
          <Button variant="ghost" size="sm" onClick={() => useStudio.getState().setShortcutsOpen(true)}>
            <Keyboard className="h-4 w-4" />
            Shortcuts
          </Button>
        </div>
      </WindowBody>
      <WindowFooter className="font-sans text-[13px]">Display only. Scene data is never changed.</WindowFooter>
    </div>
  );
}

function CameraRow({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex h-12 w-full items-center gap-3 rounded-[8px] px-3 text-left transition-colors',
        selected ? 'bg-ink-3 ring-1 ring-accent/50' : 'hover:bg-ink-3/60',
      )}
    >
      <span aria-hidden="true" className={cn('grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border', selected ? 'border-accent' : 'border-fg-3')}>
        {selected && <span className="h-2 w-2 rounded-full bg-accent" />}
      </span>
      {children}
    </button>
  );
}
