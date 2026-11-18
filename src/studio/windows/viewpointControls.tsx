import { useMemo, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Grid3x3, Lightbulb, Lock, Navigation, ScanEye, SunMedium, Video } from 'lucide-react';
import { useStage } from '../../stage/store';
import { LOOKS, type Look } from '../../viewer/core/look';
import { Tooltip } from '../../ui/Tooltip';
import { cn } from '../../ui/cn';
import { ReplayPlayer } from '../../viewer/replay/ReplayPlayer';
import { listCameras, MAIN_CAMERA_TAG } from '../cameras';
import { usePlaybackTime, type Playback } from '../playback';
import type { CameraMode, FollowStyle, ViewSettings } from '../viewSettings';
import { useLocked, useStudio } from '../studioStore';
import { LockBadge, SectionTitle } from './parts';

/**
 * The camera and display controls the Viewpoint window and the phone's Settings sheet share. Both
 * read and write the studio store through its guarded actions, so a share link's locks hold in
 * either place. `roomy` makes the targets large enough for a finger.
 */

type ToggleKey = { [K in keyof ViewSettings]: ViewSettings[K] extends boolean ? K : never }[keyof ViewSettings];

const TOGGLES: { key: ToggleKey; label: string; icon: LucideIcon }[] = [
  { key: 'grid', label: 'Grid', icon: Grid3x3 },
  { key: 'shadows', label: 'Shadows', icon: SunMedium },
  { key: 'sceneLights', label: 'Scene lights', icon: Lightbulb },
  { key: 'cameraGizmos', label: 'Camera lines', icon: Video },
];

const MODES: { mode: CameraMode; label: string; tip: string; icon: LucideIcon }[] = [
  { mode: 'firstPerson', label: '1st person', tip: '1st person (P)', icon: ScanEye },
  { mode: 'follow', label: 'Follow', tip: 'Follow', icon: Navigation },
];

const LOOK_LABELS: Record<Look, { label: string; hint: string }> = {
  game: { label: 'Game', hint: "The scene's own sky, light, fog and baked lighting, as the game drew it." },
  studio: { label: 'Studio', hint: 'A neutral studio light, whatever the scene had.' },
};

const FOLLOW_STYLES: { style: FollowStyle; label: string; hint: string }[] = [
  { style: 'behind', label: 'Behind', hint: 'Chases from behind and above.' },
  { style: 'front', label: 'Front', hint: 'Side-on, leading where they move.' },
];

/** The cameras of the scene, each focusable, seen through (1st person) or followed, then the free camera and the follow style. */
export function CameraTargets({ playback, roomy = false }: { playback: Playback; roomy?: boolean }) {
  const root = useStudio((s) => s.root);
  const focusId = useStudio((s) => s.focusCameraId);
  const mode = useStudio((s) => s.cameraMode);
  const followStyle = useStudio((s) => s.settings.followStyle);
  const setSetting = useStudio((s) => s.setSetting);
  const cameras = useMemo(() => (root ? listCameras(root) : []), [root]);
  // What the owner of a shared link locked; each control below is disabled for its own value.
  const targetLocked = useLocked('cameraTarget');
  const modeLocked = useLocked('cameraMode');
  const styleLocked = useLocked('followStyle');
  // Whether a camera is switched on changes as the recording plays; a few times a second is enough.
  usePlaybackTime(playback, 4);

  return (
    <>
      <SectionTitle className="mb-1.5 flex items-center gap-2">
        Cameras
        {targetLocked && <LockBadge />}
      </SectionTitle>
      {cameras.length === 0 ? (
        <p className="text-[13px] leading-5 text-fg-2">No cameras in this export. Re-export the scene from Unity (MoodyBlues &gt; Export This Scene).</p>
      ) : (
        <div role="group" aria-label="Cameras" className="space-y-0.5">
          {cameras.map((c) => {
            const focused = focusId === c.id;
            const inactive = !ReplayPlayer.isEffectivelyVisible(c.node);
            return (
              <Row key={c.id} selected={focused} roomy={roomy}>
                <button type="button" aria-pressed={focused} disabled={targetLocked} onClick={() => useStudio.getState().setCameraMode(c.id, 'follow')} className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-[6px] pl-2.5 text-left disabled:cursor-default">
                  <Video className={cn('h-4 w-4 shrink-0', focused ? 'text-accent' : 'text-fg-3')} strokeWidth={1.6} />
                  <span className="min-w-0 truncate text-[14px] text-fg">{c.name}</span>
                  {c.tag === MAIN_CAMERA_TAG && <span className="shrink-0 rounded-[4px] bg-accent/16 px-1.5 py-0.5 text-[11px] font-medium leading-none text-accent">Main</span>}
                  {inactive && <span className="shrink-0 text-[11px] text-fg-3">inactive</span>}
                </button>
                <div role="radiogroup" aria-label={`${c.name} view`} className="flex shrink-0 gap-0.5 rounded-[7px] bg-ink-1/70 p-0.5">
                  {MODES.map((m) => {
                    const on = focused && mode === m.mode;
                    // A locked target keeps the focused camera, so only its own buttons can still change how it is viewed.
                    const off = modeLocked || (targetLocked && !focused);
                    return (
                      <Tooltip key={m.mode} content={m.tip}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={on}
                          aria-label={m.label}
                          disabled={off}
                          onClick={() => useStudio.getState().setCameraMode(c.id, m.mode)}
                          className={cn(
                            'inline-flex items-center justify-center rounded-[5px] transition-colors disabled:cursor-default disabled:opacity-60',
                            roomy ? 'h-9 w-10' : 'h-7 w-7',
                            on ? 'bg-accent/18 text-accent' : 'text-fg-2 hover:bg-ink-4 hover:text-fg',
                          )}
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
          <Row selected={focusId === null} roomy={roomy}>
            <button type="button" aria-pressed={focusId === null} disabled={targetLocked} onClick={() => useStudio.getState().setFocusCamera(null)} className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-[6px] pl-2.5 text-left disabled:cursor-default">
              <Video className={cn('h-4 w-4 shrink-0', focusId === null ? 'text-accent' : 'text-fg-3')} strokeWidth={1.6} />
              <span className="min-w-0 truncate text-[14px] text-fg">Free camera</span>
            </button>
          </Row>
        </div>
      )}

      {focusId !== null && mode === 'follow' && (
        <div className={cn('mt-2 flex items-center justify-between gap-3 px-1', roomy ? 'h-11' : 'h-9')}>
          <span className="flex items-center gap-2 text-[13px] text-fg-2">
            Follow style
            {styleLocked && <LockBadge />}
          </span>
          <div role="radiogroup" aria-label="Follow style" className="flex w-40 gap-0.5 rounded-[8px] bg-ink-1/70 p-0.5">
            {FOLLOW_STYLES.map((f) => (
              <Tooltip key={f.style} content={f.hint}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={followStyle === f.style}
                  disabled={styleLocked}
                  onClick={() => setSetting('followStyle', f.style)}
                  className={cn('flex-1 rounded-[6px] text-[13px] transition-colors disabled:cursor-default', roomy ? 'h-9' : 'h-7', followStyle === f.style ? 'bg-accent/18 text-accent' : 'text-fg-2 hover:bg-ink-4 hover:text-fg')}
                >
                  {f.label}
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * How the scene is lit: the game's own look or the neutral studio. Where the export carries no game
 * lighting (an older export) both draw the studio, and the caption says so.
 */
export function LookPicker({ roomy = false }: { roomy?: boolean }) {
  const look = useStudio((s) => s.settings.look);
  const setSetting = useStudio((s) => s.setSetting);
  const locked = useLocked('look');
  const hasGame = useStage((s) => s.game !== null);
  return (
    <div className="mb-1.5">
      <div className={cn('flex items-center justify-between gap-3 px-1', roomy ? 'h-11' : 'h-9')}>
        <span className="flex items-center gap-2 text-[13px] text-fg-2">
          Look
          {locked && <LockBadge />}
        </span>
        <div role="radiogroup" aria-label="Look" className="flex w-40 gap-0.5 rounded-[8px] bg-ink-1/70 p-0.5">
          {LOOKS.map((l) => (
            <Tooltip key={l} content={LOOK_LABELS[l].hint}>
              <button
                type="button"
                role="radio"
                aria-checked={look === l}
                disabled={locked}
                onClick={() => setSetting('look', l)}
                className={cn('flex-1 rounded-[6px] text-[13px] transition-colors disabled:cursor-default', roomy ? 'h-9' : 'h-7', look === l ? 'bg-accent/18 text-accent' : 'text-fg-2 hover:bg-ink-4 hover:text-fg')}
              >
                {LOOK_LABELS[l].label}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>
      {look === 'game' && !hasGame && <p className="px-1 text-[12px] leading-4 text-fg-3">This export has no game lighting, so it is drawn in the studio look. Re-export from Unity.</p>}
    </div>
  );
}

/** The switches for what is drawn: grid, shadows, scene lights, camera lines. A locked one shows its lock and cannot be pressed. */
export function DisplayToggles({ roomy = false }: { roomy?: boolean }) {
  const settings = useStudio((s) => s.settings);
  const setSetting = useStudio((s) => s.setSetting);
  const locked: Record<ToggleKey, boolean> = {
    grid: useLocked('grid'),
    shadows: useLocked('shadows'),
    sceneLights: useLocked('sceneLights'),
    cameraGizmos: useLocked('cameraGizmos'),
  };

  return (
    <div className="grid grid-cols-2 gap-1.5">
      {TOGGLES.map((t) => {
        const on = settings[t.key];
        const toggle = (
          <button
            key={t.key}
            type="button"
            aria-pressed={on}
            disabled={locked[t.key]}
            onClick={() => setSetting(t.key, !on)}
            className={cn(
              'flex w-full items-center gap-2 rounded-[8px] border px-2.5 text-left text-[13px] transition-colors disabled:pointer-events-none',
              roomy ? 'h-11' : 'h-8',
              on ? 'border-accent/40 bg-accent/12 text-accent' : 'border-rule bg-ink-3/50 text-fg-2 hover:border-rule-strong hover:text-fg',
            )}
          >
            <t.icon className="h-4 w-4 shrink-0" strokeWidth={1.6} />
            <span className="min-w-0 flex-1 truncate">{t.label}</span>
            {locked[t.key] && <Lock aria-hidden="true" className="h-3 w-3 shrink-0 text-fg-3" />}
          </button>
        );
        return locked[t.key] ? (
          <Tooltip key={t.key} content="Set by the owner">
            <span className="block">{toggle}</span>
          </Tooltip>
        ) : (
          toggle
        );
      })}
    </div>
  );
}

function Row({ selected, roomy, children }: { selected: boolean; roomy: boolean; children: ReactNode }) {
  return <div className={cn('flex items-center gap-2 rounded-[8px] pr-1 transition-colors', roomy ? 'h-11' : 'h-9', selected ? 'bg-ink-3 ring-1 ring-accent/50' : 'hover:bg-ink-3/60')}>{children}</div>;
}
