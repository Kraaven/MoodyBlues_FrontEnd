import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CameraInfo } from '../studio/cameras';
import { SPEEDS } from '../studio/playback';
import { shareLayout } from './shareLayout';
import {
  canSelect,
  DEFAULT_SHARE_SETTINGS,
  isLocked,
  nearestSpeed,
  panelAvailable,
  parseShareSettings,
  resolveCameraTarget,
  toTemplate,
  viewSettingsOf,
  type ShareSettings,
} from './shareSettings';

function camera(id: number, index: number, name: string): CameraInfo {
  return { id, index, tag: index === 0 ? 'MainCamera' : '', name, node: new THREE.Object3D() };
}

const cameras = [camera(10, 0, 'Main Camera'), camera(20, 1, 'FirstPerson'), camera(30, 2, 'Overhead')];

/** A fully specified settings object, as the studio's editor would save it. */
function custom(): ShareSettings {
  const s = structuredClone(DEFAULT_SHARE_SETTINGS);
  s.camera.target = { value: { kind: 'id', id: 20, name: 'FirstPerson' }, locked: true };
  s.camera.mode = { value: 'firstPerson', locked: true };
  s.camera.followStyle = { value: 'front', locked: false };
  s.camera.firstPersonNear = { value: 0.2, locked: true };
  s.camera.fov = { value: 70, locked: true };
  s.display.grid = { value: false, locked: true };
  s.display.shadows = { value: false, locked: false };
  s.display.sceneLights = { value: true, locked: false };
  s.display.cameraGizmos = { value: false, locked: true };
  s.playback = { startTime: 12.5, speed: { value: 2, locked: true }, seeking: { locked: true } };
  s.panels.materials = { available: true, openAtStart: true };
  s.panels.logs = { available: true, openAtStart: true };
  s.interaction.selectObjects = false;
  return s;
}

describe('DEFAULT_SHARE_SETTINGS', () => {
  it('starts on the main camera, follow, nothing locked', () => {
    const d = DEFAULT_SHARE_SETTINGS;
    expect(d.camera.target).toEqual({ value: { kind: 'main' }, locked: false });
    expect(d.camera.mode).toEqual({ value: 'follow', locked: false });
    expect(d.camera.fov.value).toBe(45);
    expect(d.camera.firstPersonNear.value).toBeNull();
    expect(d.playback).toEqual({ startTime: 0, speed: { value: 1, locked: false }, seeking: { locked: false } });
    expect(d.interaction.selectObjects).toBe(true);
    for (const key of ['cameraTarget', 'cameraMode', 'followStyle', 'firstPersonNear', 'fov', 'grid', 'shadows', 'sceneLights', 'cameraGizmos', 'speed', 'seeking'] as const) {
      expect(isLocked(d, key)).toBe(false);
    }
  });

  it('makes logs, hierarchy, inspector and viewpoint available and opens none', () => {
    const available = Object.entries(DEFAULT_SHARE_SETTINGS.panels).filter(([, p]) => p.available).map(([id]) => id);
    expect(available.sort()).toEqual(['hierarchy', 'inspector', 'logs', 'viewpoint']);
    expect(Object.values(DEFAULT_SHARE_SETTINGS.panels).some((p) => p.openAtStart)).toBe(false);
  });
});

describe('parseShareSettings', () => {
  it('returns the defaults for anything that is not an object', () => {
    for (const raw of [null, undefined, 3, 'x', [], true]) expect(parseShareSettings(raw)).toEqual(DEFAULT_SHARE_SETTINGS);
  });

  it('round-trips what it produced', () => {
    expect(parseShareSettings(custom())).toEqual(custom());
    expect(parseShareSettings(JSON.parse(JSON.stringify(DEFAULT_SHARE_SETTINGS)))).toEqual(DEFAULT_SHARE_SETTINGS);
  });

  it('fills the keys that are missing and keeps the ones that are there', () => {
    const parsed = parseShareSettings({ camera: { fov: { value: 60 } }, playback: { speed: { locked: true } } });
    expect(parsed.camera.fov).toEqual({ value: 60, locked: false });
    expect(parsed.playback.speed).toEqual({ value: 1, locked: true });
    expect(parsed.camera.target).toEqual(DEFAULT_SHARE_SETTINGS.camera.target);
    expect(parsed.panels).toEqual(DEFAULT_SHARE_SETTINGS.panels);
  });

  it('ignores unknown keys, at every level', () => {
    const parsed = parseShareSettings({ version: 9, extra: 1, camera: { zoom: 3, fov: { value: 50, locked: true, note: 'x' } }, panels: { teleporter: { available: true } } });
    expect(parsed).toEqual({ ...DEFAULT_SHARE_SETTINGS, camera: { ...DEFAULT_SHARE_SETTINGS.camera, fov: { value: 50, locked: true } } });
    expect('extra' in parsed).toBe(false);
    expect('teleporter' in parsed.panels).toBe(false);
  });

  it('clamps the field of view to 20..90', () => {
    expect(parseShareSettings({ camera: { fov: { value: 5 } } }).camera.fov.value).toBe(20);
    expect(parseShareSettings({ camera: { fov: { value: 500 } } }).camera.fov.value).toBe(90);
    expect(parseShareSettings({ camera: { fov: { value: 'wide' } } }).camera.fov.value).toBe(45);
    expect(parseShareSettings({ camera: { fov: { value: Number.NaN } } }).camera.fov.value).toBe(45);
  });

  it('snaps the speed to one of the Timeline steps', () => {
    expect(parseShareSettings({ playback: { speed: { value: 3.1 } } }).playback.speed.value).toBe(4);
    expect(parseShareSettings({ playback: { speed: { value: 0.1 } } }).playback.speed.value).toBe(0.25);
    expect(parseShareSettings({ playback: { speed: { value: 0.5 } } }).playback.speed.value).toBe(0.5);
    expect(parseShareSettings({ playback: { speed: { value: 'fast' } } }).playback.speed.value).toBe(1);
    for (const raw of [-3, 0, 1.4, 99]) expect(SPEEDS as readonly number[]).toContain(nearestSpeed(raw));
  });

  it('keeps the near clip positive, in range, or null for automatic', () => {
    const near = (value: unknown) => parseShareSettings({ camera: { firstPersonNear: { value } } }).camera.firstPersonNear.value;
    expect(near(null)).toBeNull();
    expect(near(0.4)).toBe(0.4);
    expect(near(0)).toBeNull();
    expect(near(-1)).toBeNull();
    expect(near(0.0001)).toBe(0.01);
    expect(near(50)).toBe(1.5);
    expect(near('close')).toBeNull();
  });

  it('keeps the start time at zero or later', () => {
    const start = (startTime: unknown) => parseShareSettings({ playback: { startTime } }).playback.startTime;
    expect(start(83.25)).toBe(83.25);
    expect(start(-5)).toBe(0);
    expect(start(Number.POSITIVE_INFINITY)).toBe(0);
    expect(start('10')).toBe(0);
  });

  it('reads every kind of camera target, and falls back to main for a broken one', () => {
    const target = (value: unknown) => parseShareSettings({ camera: { target: { value } } }).camera.target.value;
    expect(target({ kind: 'free' })).toEqual({ kind: 'free' });
    expect(target({ kind: 'named', name: '  FirstPerson ' })).toEqual({ kind: 'named', name: 'FirstPerson' });
    expect(target({ kind: 'id', id: 7, name: 'Cam' })).toEqual({ kind: 'id', id: 7, name: 'Cam' });
    expect(target({ kind: 'id', id: 7 })).toEqual({ kind: 'id', id: 7, name: '' });
    expect(target({ kind: 'named', name: '   ' })).toEqual({ kind: 'main' });
    expect(target({ kind: 'id', id: 1.5, name: 'x' })).toEqual({ kind: 'main' });
    expect(target({ kind: 'sky' })).toEqual({ kind: 'main' });
    expect(target('main')).toEqual({ kind: 'main' });
  });

  it('never opens a panel that is unavailable', () => {
    const parsed = parseShareSettings({ panels: { raw: { available: false, openAtStart: true }, logs: { available: false, openAtStart: true } } });
    expect(parsed.panels.raw).toEqual({ available: false, openAtStart: false });
    expect(parsed.panels.logs).toEqual({ available: false, openAtStart: false });
  });

  it('does not throw on hostile input', () => {
    const hostile = [{ camera: null }, { camera: [] }, { panels: 3 }, { panels: { logs: null } }, { playback: { seeking: 'yes' } }, { display: { grid: { value: 'on', locked: 'yes' } } }];
    for (const raw of hostile) expect(() => parseShareSettings(raw)).not.toThrow();
    expect(parseShareSettings({ display: { grid: { value: 'on', locked: 'yes' } } }).display.grid).toEqual({ value: true, locked: false });
  });
});

describe('toTemplate', () => {
  it('turns a camera picked by id into one picked by name', () => {
    const template = toTemplate(custom());
    expect(template.camera.target).toEqual({ value: { kind: 'named', name: 'FirstPerson' }, locked: true });
  });

  it('keeps main, free and named targets as they are', () => {
    for (const value of [{ kind: 'main' }, { kind: 'free' }, { kind: 'named', name: 'Cam' }] as const) {
      const s = structuredClone(DEFAULT_SHARE_SETTINGS);
      s.camera.target.value = value;
      expect(toTemplate(s).camera.target.value).toEqual(value);
    }
  });

  it('falls back to main for an id whose name is unknown', () => {
    const s = structuredClone(DEFAULT_SHARE_SETTINGS);
    s.camera.target.value = { kind: 'id', id: 3, name: '' };
    expect(toTemplate(s).camera.target.value).toEqual({ kind: 'main' });
  });

  it('drops the start time, which belongs to one recording, and changes nothing else', () => {
    const source = custom();
    const template = toTemplate(source);
    expect(template.playback.startTime).toBe(0);
    expect({ ...template, camera: source.camera, playback: source.playback }).toEqual(source);
    expect(source.playback.startTime).toBe(12.5);
    expect(source.camera.target.value.kind).toBe('id');
  });
});

describe('resolveCameraTarget', () => {
  it('main is the first camera', () => {
    expect(resolveCameraTarget(cameras, { kind: 'main' })).toBe(cameras[0]);
  });

  it('free is no camera', () => {
    expect(resolveCameraTarget(cameras, { kind: 'free' })).toBeNull();
  });

  it('finds a named camera by node name', () => {
    expect(resolveCameraTarget(cameras, { kind: 'named', name: 'Overhead' })).toBe(cameras[2]);
  });

  it('finds an id by id, even when the name no longer matches', () => {
    expect(resolveCameraTarget(cameras, { kind: 'id', id: 20, name: 'Old name' })).toBe(cameras[1]);
  });

  it('finds an id by name when the id is gone', () => {
    expect(resolveCameraTarget(cameras, { kind: 'id', id: 999, name: 'Overhead' })).toBe(cameras[2]);
  });

  it('prefers the id over a different camera that has the name', () => {
    expect(resolveCameraTarget(cameras, { kind: 'id', id: 10, name: 'Overhead' })).toBe(cameras[0]);
  });

  it('falls back to main when nothing matches', () => {
    expect(resolveCameraTarget(cameras, { kind: 'named', name: 'Nope' })).toBe(cameras[0]);
    expect(resolveCameraTarget(cameras, { kind: 'id', id: 999, name: 'Nope' })).toBe(cameras[0]);
  });

  it('falls back to the free camera when the scene exports none', () => {
    for (const target of [{ kind: 'main' }, { kind: 'named', name: 'x' }, { kind: 'id', id: 1, name: 'x' }, { kind: 'free' }] as const) {
      expect(resolveCameraTarget([], target)).toBeNull();
    }
  });
});

describe('what a visitor may do', () => {
  it('has no restriction in the owner\'s studio', () => {
    expect(isLocked(null, 'seeking')).toBe(false);
    expect(isLocked(null, 'cameraTarget')).toBe(false);
    expect(panelAvailable(null, 'raw')).toBe(true);
    expect(canSelect(null)).toBe(true);
  });

  it('reads each lock from its own setting', () => {
    const s = custom();
    expect(isLocked(s, 'cameraTarget')).toBe(true);
    expect(isLocked(s, 'cameraMode')).toBe(true);
    expect(isLocked(s, 'followStyle')).toBe(false);
    expect(isLocked(s, 'firstPersonNear')).toBe(true);
    expect(isLocked(s, 'fov')).toBe(true);
    expect(isLocked(s, 'grid')).toBe(true);
    expect(isLocked(s, 'shadows')).toBe(false);
    expect(isLocked(s, 'sceneLights')).toBe(false);
    expect(isLocked(s, 'cameraGizmos')).toBe(true);
    expect(isLocked(s, 'speed')).toBe(true);
    expect(isLocked(s, 'seeking')).toBe(true);
  });

  it('knows which panels exist and whether selecting is on', () => {
    const s = custom();
    expect(panelAvailable(s, 'materials')).toBe(true);
    expect(panelAvailable(s, 'raw')).toBe(false);
    expect(panelAvailable(s, 'recordings')).toBe(true);
    expect(canSelect(s)).toBe(false);
    expect(canSelect(DEFAULT_SHARE_SETTINGS)).toBe(true);
  });

  it('turns the settings into the studio\'s starting view settings', () => {
    expect(viewSettingsOf(custom())).toEqual({ grid: false, shadows: false, fov: 70, sceneLights: true, cameraGizmos: false, followStyle: 'front', firstPersonNear: 0.2 });
  });
});

describe('shareLayout', () => {
  it('docks the available panels that open at the start, in rail order', () => {
    const layout = shareLayout(custom().panels);
    expect(layout.docked).toEqual(['logs', 'materials']);
    expect(layout.dockActive).toBe('logs');
    expect(layout.dockOpen).toBe(true);
    expect(layout.open).toEqual([]);
  });

  it('opens nothing when no panel opens at the start', () => {
    const layout = shareLayout(DEFAULT_SHARE_SETTINGS.panels);
    expect(layout.docked).toEqual([]);
    expect(layout.dockOpen).toBe(false);
  });
});
