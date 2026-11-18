import type { ReactNode } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { SPEEDS } from '../studio/playback';
import { FOV_RANGE, NEAR_RANGE } from '../studio/viewSettings';
import { formatDuration } from '../lib/format';
import { Button } from '../ui/Button';
import { Input, Toggle } from '../ui/Field';
import { Tooltip } from '../ui/Tooltip';
import { cn } from '../ui/cn';
import { PANEL_IDS, type CameraTarget, type PanelId, type ShareSettings } from './shareSettings';

/** A camera the scene exports, as the editor offers it. */
export interface CameraChoice {
  id: number;
  name: string;
}

const PANEL_TITLES: Record<PanelId, string> = {
  logs: 'Logs',
  details: 'Session details',
  hierarchy: 'Hierarchy',
  inspector: 'Inspector',
  materials: 'Materials',
  textures: 'Textures',
  geometry: 'Geometry',
  viewpoint: 'Viewpoint',
  raw: 'Raw data',
};

const DISPLAY: { key: Exclude<keyof ShareSettings['display'], 'look'>; label: string }[] = [
  { key: 'grid', label: 'Grid' },
  { key: 'shadows', label: 'Shadows' },
  { key: 'sceneLights', label: 'Scene lights' },
  { key: 'cameraGizmos', label: 'Camera lines' },
];

const selectClass =
  'h-9 min-w-0 max-w-full rounded-[var(--radius-control)] border border-rule bg-ink-1 px-2.5 text-[14px] text-fg outline-none ' +
  'hover:border-rule-strong focus:border-accent/70 focus-visible:outline-none';

interface EditorProps {
  value: ShareSettings;
  onChange: (next: ShareSettings) => void;
  /**
   * The cameras of the loaded scene, to pick one from. Null when no scene is loaded (the recordings
   * table), where only the main and free cameras, and the one already chosen, can be offered.
   */
  cameras: readonly CameraChoice[] | null;
  /** A project's template, not one link's: a camera is chosen by name, and there is no start time. */
  template?: boolean;
  /** Where the recording is now, in seconds, for "Start at the current time". Omitted when no recording is playing. */
  currentTime?: number | null;
}

/**
 * Edits what the visitors of a share link (or of every new link of a project) start with, and what
 * they may change. Every value a visitor can touch has a lock beside it. The component is
 * controlled and saves nothing: the dialogs that host it decide when and where.
 */
export function ShareSettingsEditor({ value, onChange, cameras, template = false, currentTime = null }: EditorProps) {
  // The settings are plain data, so a copy edited in place is the next value.
  const edit = (change: (draft: ShareSettings) => void) => {
    const draft = structuredClone(value);
    change(draft);
    onChange(draft);
  };
  const lock = (item: { locked: boolean }, set: (locked: boolean) => void) => ({ locked: item.locked, onChange: set });
  const { camera, display, playback, panels } = value;

  return (
    <div className="space-y-6">
      <Section title="Camera">
        <Row label="Starts on" lock={lock(camera.target, (l) => edit((d) => (d.camera.target.locked = l)))}>
          <CameraPicker target={camera.target.value} cameras={cameras} template={template} onChange={(t) => edit((d) => (d.camera.target.value = t))} />
        </Row>
        {!template && cameras === null && <p className="pb-1 text-[13px] leading-5 text-fg-3">Open the recording to pick any of its cameras.</p>}
        <Row label="View" lock={lock(camera.mode, (l) => edit((d) => (d.camera.mode.locked = l)))}>
          <Segmented
            label="View"
            value={camera.mode.value}
            options={[
              { value: 'firstPerson', label: '1st person' },
              { value: 'follow', label: 'Follow' },
            ]}
            onChange={(v) => edit((d) => (d.camera.mode.value = v))}
          />
        </Row>
        <Row label="Follow style" lock={lock(camera.followStyle, (l) => edit((d) => (d.camera.followStyle.locked = l)))}>
          <Segmented
            label="Follow style"
            value={camera.followStyle.value}
            options={[
              { value: 'behind', label: 'Behind' },
              { value: 'front', label: 'Front' },
            ]}
            onChange={(v) => edit((d) => (d.camera.followStyle.value = v))}
          />
        </Row>
        <Row label="Near clip" lock={lock(camera.firstPersonNear, (l) => edit((d) => (d.camera.firstPersonNear.locked = l)))}>
          <input
            type="range"
            aria-label="Near clip"
            min={NEAR_RANGE.min}
            max={NEAR_RANGE.max}
            step={0.01}
            value={camera.firstPersonNear.value ?? 0.3}
            onChange={(e) => edit((d) => (d.camera.firstPersonNear.value = Number(e.target.value)))}
            className="w-24"
          />
          <span className="tabular w-12 text-right font-mono text-[13px] text-fg">{camera.firstPersonNear.value === null ? 'auto' : `${camera.firstPersonNear.value.toFixed(2)}m`}</span>
          <Button variant="ghost" size="sm" aria-pressed={camera.firstPersonNear.value === null} onClick={() => edit((d) => (d.camera.firstPersonNear.value = null))}>
            Auto
          </Button>
        </Row>
        <Row label="Field of view" lock={lock(camera.fov, (l) => edit((d) => (d.camera.fov.locked = l)))}>
          <input
            type="range"
            aria-label="Field of view"
            min={FOV_RANGE.min}
            max={FOV_RANGE.max}
            step={1}
            value={camera.fov.value}
            onChange={(e) => edit((d) => (d.camera.fov.value = Number(e.target.value)))}
            className="w-28"
          />
          <span className="tabular w-9 text-right font-mono text-[13px] text-fg">{camera.fov.value}°</span>
        </Row>
      </Section>

      <Section title="Display">
        <Row label="Look" hint="Game uses the scene's own sky, light and fog when the export has them." lock={lock(display.look, (l) => edit((d) => (d.display.look.locked = l)))}>
          <Segmented
            label="Look"
            value={display.look.value}
            options={[
              { value: 'game', label: 'Game' },
              { value: 'studio', label: 'Studio' },
            ]}
            onChange={(v) => edit((d) => (d.display.look.value = v))}
          />
        </Row>
        {DISPLAY.map(({ key, label }) => (
          <Row key={key} label={label} lock={lock(display[key], (l) => edit((d) => (d.display[key].locked = l)))}>
            <Toggle label={label} checked={display[key].value} onChange={(v) => edit((d) => (d.display[key].value = v))} />
          </Row>
        ))}
      </Section>

      <Section title="Playback">
        {!template && (
          <Row label="Start" hint={playback.startTime > 0 ? `Starts at ${formatDuration(playback.startTime)}.` : 'Starts at the beginning.'}>
            {currentTime !== null && currentTime > 0 && (
              <Button variant="secondary" size="sm" onClick={() => edit((d) => (d.playback.startTime = Math.round(currentTime * 100) / 100))}>
                Start at current time ({formatDuration(currentTime)})
              </Button>
            )}
            {playback.startTime > 0 && (
              <Button variant="ghost" size="sm" onClick={() => edit((d) => (d.playback.startTime = 0))}>
                From the beginning
              </Button>
            )}
          </Row>
        )}
        <Row label="Speed" lock={lock(playback.speed, (l) => edit((d) => (d.playback.speed.locked = l)))}>
          <select aria-label="Speed" className={selectClass} value={playback.speed.value} onChange={(e) => edit((d) => (d.playback.speed.value = Number(e.target.value)))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </Row>
        <Row label="Visitors can jump around the timeline" lock={lock(playback.seeking, (l) => edit((d) => (d.playback.seeking.locked = l)))} hint="Locked, the timeline only plays and pauses." />
      </Section>

      <Section title="Panels">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-1">
          <span />
          <span className="w-16 text-center text-[11px] leading-4 text-fg-3">Visitors can open</span>
          <span className="w-16 text-center text-[11px] leading-4 text-fg-3">Open at start</span>
          {PANEL_IDS.map((id) => (
            <PanelRow
              key={id}
              title={PANEL_TITLES[id]}
              available={panels[id].available}
              openAtStart={panels[id].openAtStart}
              onAvailable={(v) =>
                edit((d) => {
                  d.panels[id].available = v;
                  if (!v) d.panels[id].openAtStart = false;
                })
              }
              onOpenAtStart={(v) => edit((d) => (d.panels[id].openAtStart = v))}
            />
          ))}
        </div>
      </Section>

      <Section title="Interaction">
        <Row label="Visitors can select objects">
          <Toggle label="Visitors can select objects" checked={value.interaction.selectObjects} onChange={(v) => edit((d) => (d.interaction.selectObjects = v))} />
        </Row>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <p className="eyebrow mb-2">{title}</p>
      <div className="divide-y divide-rule/60">{children}</div>
    </section>
  );
}

interface LockProps {
  locked: boolean;
  onChange: (locked: boolean) => void;
}

/** A label, its control, and the lock that decides whether a visitor may change it. */
function Row({ label, hint, lock, children }: { label: string; hint?: ReactNode; lock?: LockProps; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
      <div className="min-w-[8rem] flex-1">
        <span className="block text-[14px] leading-5 text-fg-2">{label}</span>
        {hint && <span className="block text-[12px] leading-4 text-fg-3">{hint}</span>}
      </div>
      {children && <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">{children}</div>}
      {lock && <LockToggle label={label} {...lock} />}
    </div>
  );
}

function LockToggle({ label, locked, onChange }: LockProps & { label: string }) {
  const Icon = locked ? Lock : LockOpen;
  return (
    <Tooltip content={locked ? 'Visitors cannot change this' : 'Visitors can change this'}>
      <button
        type="button"
        aria-pressed={locked}
        aria-label={`Lock ${label}`}
        onClick={() => onChange(!locked)}
        className={cn(
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] transition-colors',
          locked ? 'bg-accent/18 text-accent' : 'text-fg-3 hover:bg-ink-3 hover:text-fg',
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={1.7} />
      </button>
    </Tooltip>
  );
}

function PanelRow({ title, available, openAtStart, onAvailable, onOpenAtStart }: { title: string; available: boolean; openAtStart: boolean; onAvailable: (v: boolean) => void; onOpenAtStart: (v: boolean) => void }) {
  return (
    <>
      <span className="py-1.5 text-[14px] text-fg-2">{title}</span>
      <span className="flex w-16 justify-center">
        <Toggle label={`${title}: visitors can open`} checked={available} onChange={onAvailable} />
      </span>
      <span className={cn('flex w-16 justify-center', !available && 'opacity-40')}>
        <Toggle label={`${title}: open at start`} checked={openAtStart} disabled={!available} onChange={onOpenAtStart} />
      </span>
    </>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-0.5 rounded-[8px] bg-ink-1/70 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('h-7 rounded-[6px] px-2.5 text-[13px] transition-colors', value === o.value ? 'bg-accent/18 text-accent' : 'text-fg-2 hover:bg-ink-4 hover:text-fg')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const targetKey = (t: CameraTarget) => (t.kind === 'id' ? `id:${t.id}` : t.kind);

function CameraPicker({ target, cameras, template, onChange }: { target: CameraTarget; cameras: readonly CameraChoice[] | null; template: boolean; onChange: (t: CameraTarget) => void }) {
  const options: { key: string; label: string; target: CameraTarget }[] = [
    { key: 'main', label: 'Main camera', target: { kind: 'main' } },
    { key: 'free', label: 'Free camera', target: { kind: 'free' } },
  ];
  if (template) options.push({ key: 'named', label: 'Camera named…', target: { kind: 'named', name: target.kind === 'named' ? target.name : '' } });
  else {
    for (const c of cameras ?? []) options.push({ key: `id:${c.id}`, label: c.name, target: { kind: 'id', id: c.id, name: c.name } });
    // The camera already chosen stays pickable even where the scene is not loaded to list it.
    if ((target.kind === 'named' || target.kind === 'id') && !options.some((o) => o.key === targetKey(target))) {
      options.push({ key: targetKey(target), label: target.name || 'Chosen camera', target });
    }
  }
  const current = options.find((o) => o.key === targetKey(target))?.key ?? 'main';

  return (
    <>
      <select aria-label="Starting camera" className={cn(selectClass, 'w-44')} value={current} onChange={(e) => onChange(options.find((o) => o.key === e.target.value)!.target)}>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      {template && target.kind === 'named' && (
        <Input aria-label="Camera name" className="h-9 w-44 px-2.5 text-[14px]" placeholder="Camera name" value={target.name} maxLength={200} onChange={(e) => onChange({ kind: 'named', name: e.target.value })} />
      )}
    </>
  );
}
