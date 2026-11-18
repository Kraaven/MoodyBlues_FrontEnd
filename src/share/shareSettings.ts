import { SPEEDS } from '../studio/playback';
import { readLook, type Look } from '../viewer/core/look';
import type { CameraInfo } from '../studio/cameras';
import { DEFAULT_VIEW_SETTINGS, FOV_RANGE, NEAR_RANGE, type CameraMode, type FollowStyle, type ViewSettings } from '../studio/viewSettings';

/**
 * What the owner of a shared recording decides for its visitors. Every setting a visitor can touch
 * has a starting value and a lock: a locked value is shown but cannot be changed on the share page.
 * The backend stores this as an opaque JSON object; this module owns its meaning, and reads what it
 * is given defensively so an object written by an older or newer build never breaks a link.
 */
export interface Lockable<T> {
  value: T;
  locked: boolean;
}

export type CameraTarget =
  /** The camera tagged MainCamera; the free camera when the scene has none. */
  | { kind: 'main' }
  /** The free orbit camera, framing the scene. */
  | { kind: 'free' }
  /** The first exported camera with this node name. Templates use it, since it works across scenes. */
  | { kind: 'named'; name: string }
  /** One exported camera by ObjectID, picked in the viewer for one link. The name is the fallback. */
  | { kind: 'id'; id: number; name: string };

export const PANEL_IDS = ['logs', 'details', 'hierarchy', 'inspector', 'materials', 'textures', 'geometry', 'viewpoint', 'raw'] as const;
export type PanelId = (typeof PANEL_IDS)[number];

export interface ShareSettings {
  version: 1;
  camera: {
    target: Lockable<CameraTarget>;
    mode: Lockable<CameraMode>;
    followStyle: Lockable<FollowStyle>;
    /** Metres; null is automatic. */
    firstPersonNear: Lockable<number | null>;
    fov: Lockable<number>;
  };
  display: {
    /** How the scene is lit: the game's own look or the neutral studio. */
    look: Lockable<Look>;
    grid: Lockable<boolean>;
    shadows: Lockable<boolean>;
    sceneLights: Lockable<boolean>;
    cameraGizmos: Lockable<boolean>;
  };
  playback: {
    /** Seconds into the recording. A `?t=` in the link wins over it. */
    startTime: number;
    speed: Lockable<number>;
    /** Locked: no scrubbing, skipping or seek shortcuts. Play and pause still work. */
    seeking: { locked: boolean };
  };
  /** An unavailable panel is absent for visitors. */
  panels: Record<PanelId, { available: boolean; openAtStart: boolean }>;
  interaction: { selectObjects: boolean };
}

/** Every value a visitor could be stopped from changing. */
export type LockKey =
  | 'cameraTarget'
  | 'cameraMode'
  | 'followStyle'
  | 'firstPersonNear'
  | 'fov'
  | 'look'
  | 'grid'
  | 'shadows'
  | 'sceneLights'
  | 'cameraGizmos'
  | 'speed'
  | 'seeking';

const unlocked = <T>(value: T): Lockable<T> => ({ value, locked: false });

const DEFAULT_AVAILABLE: ReadonlySet<PanelId> = new Set<PanelId>(['logs', 'hierarchy', 'inspector', 'viewpoint']);

function defaultPanels(): ShareSettings['panels'] {
  return Object.fromEntries(PANEL_IDS.map((id) => [id, { available: DEFAULT_AVAILABLE.has(id), openAtStart: false }])) as ShareSettings['panels'];
}

/** What a link has when neither it nor its project says anything: the studio's own defaults, nothing locked, four panels. */
export const DEFAULT_SHARE_SETTINGS: ShareSettings = {
  version: 1,
  camera: {
    target: unlocked({ kind: 'main' }),
    mode: unlocked('follow'),
    followStyle: unlocked(DEFAULT_VIEW_SETTINGS.followStyle),
    firstPersonNear: unlocked(DEFAULT_VIEW_SETTINGS.firstPersonNear),
    fov: unlocked(DEFAULT_VIEW_SETTINGS.fov),
  },
  display: {
    look: unlocked(DEFAULT_VIEW_SETTINGS.look),
    grid: unlocked(DEFAULT_VIEW_SETTINGS.grid),
    shadows: unlocked(DEFAULT_VIEW_SETTINGS.shadows),
    sceneLights: unlocked(DEFAULT_VIEW_SETTINGS.sceneLights),
    cameraGizmos: unlocked(DEFAULT_VIEW_SETTINGS.cameraGizmos),
  },
  playback: { startTime: 0, speed: unlocked(1), seeking: { locked: false } },
  panels: defaultPanels(),
  interaction: { selectObjects: true },
};

// ---- Reading what was stored -------------------------------------------------------------------

type Json = Record<string, unknown>;

function record(value: unknown): Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};
}

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A Lockable read with `read` turning the stored value into a valid one (or the fallback). */
function lockable<T>(value: unknown, fallback: Lockable<T>, read: (raw: unknown, fallback: T) => T): Lockable<T> {
  const r = record(value);
  return { value: read(r.value, fallback.value), locked: bool(r.locked, fallback.locked) };
}

function readTarget(raw: unknown, fallback: CameraTarget): CameraTarget {
  const r = record(raw);
  switch (r.kind) {
    case 'main':
    case 'free':
      return { kind: r.kind };
    case 'named': {
      const name = typeof r.name === 'string' ? r.name.trim() : '';
      return name ? { kind: 'named', name: name.slice(0, 200) } : fallback;
    }
    case 'id':
      return typeof r.id === 'number' && Number.isInteger(r.id) ? { kind: 'id', id: r.id, name: typeof r.name === 'string' ? r.name.slice(0, 200) : '' } : fallback;
    default:
      return fallback;
  }
}

function readMode(raw: unknown, fallback: CameraMode): CameraMode {
  return raw === 'firstPerson' || raw === 'follow' ? raw : fallback;
}

function readStyle(raw: unknown, fallback: FollowStyle): FollowStyle {
  return raw === 'behind' || raw === 'front' ? raw : fallback;
}

function readNear(raw: unknown, fallback: number | null): number | null {
  if (raw === null) return null;
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? clamp(raw, NEAR_RANGE.min, NEAR_RANGE.max) : fallback;
}

function readFov(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? clamp(raw, FOV_RANGE.min, FOV_RANGE.max) : fallback;
}

/** The nearest of the Timeline's speed steps. */
export function nearestSpeed(raw: number): number {
  return SPEEDS.reduce((best, s) => (Math.abs(s - raw) < Math.abs(best - raw) ? s : best), SPEEDS[0]) as number;
}

function readSpeed(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? nearestSpeed(raw) : fallback;
}

/**
 * Settings from whatever the server returned: missing keys take their default, unknown keys are
 * ignored, numbers are brought into range, and nothing throws. A panel that is not available is
 * never open at start.
 */
export function parseShareSettings(raw: unknown): ShareSettings {
  const d = DEFAULT_SHARE_SETTINGS;
  const root = record(raw);
  const camera = record(root.camera);
  const display = record(root.display);
  const playback = record(root.playback);
  const panels = record(root.panels);
  const interaction = record(root.interaction);
  const start = playback.startTime;

  return {
    version: 1,
    camera: {
      target: lockable(camera.target, d.camera.target, readTarget),
      mode: lockable(camera.mode, d.camera.mode, readMode),
      followStyle: lockable(camera.followStyle, d.camera.followStyle, readStyle),
      firstPersonNear: lockable(camera.firstPersonNear, d.camera.firstPersonNear, readNear),
      fov: lockable(camera.fov, d.camera.fov, readFov),
    },
    display: {
      look: lockable(display.look, d.display.look, readLook),
      grid: lockable(display.grid, d.display.grid, bool),
      shadows: lockable(display.shadows, d.display.shadows, bool),
      sceneLights: lockable(display.sceneLights, d.display.sceneLights, bool),
      cameraGizmos: lockable(display.cameraGizmos, d.display.cameraGizmos, bool),
    },
    playback: {
      startTime: typeof start === 'number' && Number.isFinite(start) && start > 0 ? start : 0,
      speed: lockable(playback.speed, d.playback.speed, readSpeed),
      seeking: { locked: bool(record(playback.seeking).locked, false) },
    },
    panels: Object.fromEntries(
      PANEL_IDS.map((id) => {
        const p = record(panels[id]);
        const available = bool(p.available, d.panels[id].available);
        return [id, { available, openAtStart: available && bool(p.openAtStart, d.panels[id].openAtStart) }];
      }),
    ) as ShareSettings['panels'],
    interaction: { selectObjects: bool(interaction.selectObjects, true) },
  };
}

/**
 * Settings fit to be a project's template: a camera picked by ObjectID is kept by name, since IDs
 * belong to one scene export, and the start time is dropped, since it is a moment in one recording.
 */
export function toTemplate(settings: ShareSettings): ShareSettings {
  const { target } = settings.camera;
  const value: CameraTarget = target.value.kind !== 'id' ? target.value : target.value.name ? { kind: 'named', name: target.value.name } : { kind: 'main' };
  return {
    ...settings,
    camera: { ...settings.camera, target: { ...target, value } },
    playback: { ...settings.playback, startTime: 0 },
  };
}

/**
 * The exported camera a target means, or null for the free camera. An ID is matched by ID and then
 * by name; a name by node name. A camera that is not found falls back to the main camera (the first
 * one), and to the free camera when the scene exports none.
 */
export function resolveCameraTarget(cameras: readonly CameraInfo[], target: CameraTarget): CameraInfo | null {
  if (target.kind === 'free') return null;
  const main = cameras[0] ?? null;
  switch (target.kind) {
    case 'main':
      return main;
    case 'named':
      return cameras.find((c) => c.name === target.name) ?? main;
    case 'id':
      return cameras.find((c) => c.id === target.id) ?? cameras.find((c) => c.name === target.name) ?? main;
  }
}

/** The target that selects exactly this camera (or the free camera) for one link. */
export function targetOf(camera: CameraInfo | null): CameraTarget {
  return camera ? { kind: 'id', id: camera.id, name: camera.name } : { kind: 'free' };
}

/** The view settings a share link starts the visitor with. */
export function viewSettingsOf(share: ShareSettings): ViewSettings {
  return {
    grid: share.display.grid.value,
    shadows: share.display.shadows.value,
    fov: share.camera.fov.value,
    look: share.display.look.value,
    sceneLights: share.display.sceneLights.value,
    cameraGizmos: share.display.cameraGizmos.value,
    followStyle: share.camera.followStyle.value,
    firstPersonNear: share.camera.firstPersonNear.value,
  };
}

// ---- What a visitor may do ---------------------------------------------------------------------

/** One line for a collapsed editor: which camera visitors open on, and how many values they cannot change. */
export function shareSummary(share: ShareSettings): string {
  const target = share.camera.target.value;
  const camera = target.kind === 'main' ? 'Main camera' : target.kind === 'free' ? 'Free camera' : target.name;
  const { camera: c, display: d, playback: p } = share;
  const locks = [c.target, c.mode, c.followStyle, c.firstPersonNear, c.fov, d.look, d.grid, d.shadows, d.sceneLights, d.cameraGizmos, p.speed, p.seeking].filter((l) => l.locked).length;
  return locks === 0 ? `${camera} · nothing locked` : `${camera} · ${locks} locked`;
}

/** Whether the owner locked this value. The owner's own studio has no settings, and nothing is locked in it. */
export function isLocked(share: ShareSettings | null, key: LockKey): boolean {
  if (!share) return false;
  switch (key) {
    case 'cameraTarget':
      return share.camera.target.locked;
    case 'cameraMode':
      return share.camera.mode.locked;
    case 'followStyle':
      return share.camera.followStyle.locked;
    case 'firstPersonNear':
      return share.camera.firstPersonNear.locked;
    case 'fov':
      return share.camera.fov.locked;
    case 'look':
    case 'grid':
    case 'shadows':
    case 'sceneLights':
    case 'cameraGizmos':
      return share.display[key].locked;
    case 'speed':
      return share.playback.speed.locked;
    case 'seeking':
      return share.playback.seeking.locked;
  }
}

/** Whether a visitor may have this panel. Always true in the owner's studio. */
export function panelAvailable(share: ShareSettings | null, id: string): boolean {
  if (!share) return true;
  return id in share.panels ? share.panels[id as PanelId].available : true;
}

/** Whether a click may select an object. */
export function canSelect(share: ShareSettings | null): boolean {
  return share === null || share.interaction.selectObjects;
}
