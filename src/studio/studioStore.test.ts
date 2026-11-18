import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_SHARE_SETTINGS, type ShareSettings } from '../share/shareSettings';
import { useStudio } from './studioStore';
import { DEFAULT_VIEW_SETTINGS } from './viewSettings';
import { Playback } from './playback';
import { seekByUser, setSpeedByUser } from './userActions';

function share(change: (s: ShareSettings) => void): ShareSettings {
  const s = structuredClone(DEFAULT_SHARE_SETTINGS);
  change(s);
  return s;
}

function node(): THREE.Object3D {
  const n = new THREE.Object3D();
  n.userData = { objectId: 5 };
  return n;
}

beforeEach(() => {
  useStudio.setState({ share: null, settings: DEFAULT_VIEW_SETTINGS, focusCameraId: 7, cameraMode: 'follow', follow: false, selected: null, selectedId: null, frameAllRequest: 0, frameSelectedRequest: 0, introRequest: 0 });
});

describe('the studio without a share link', () => {
  it('changes everything', () => {
    const studio = useStudio.getState();
    studio.setFocusCamera(null);
    expect(useStudio.getState().focusCameraId).toBeNull();
    studio.setCameraMode(3, 'firstPerson');
    expect(useStudio.getState()).toMatchObject({ focusCameraId: 3, cameraMode: 'firstPerson' });
    studio.setSetting('grid', false);
    expect(useStudio.getState().settings.grid).toBe(false);
    studio.select(node());
    expect(useStudio.getState().selectedId).toBe(5);
    studio.frameAll();
    expect(useStudio.getState().frameAllRequest).toBe(1);
  });
});

describe('a locked camera target', () => {
  beforeEach(() => useStudio.getState().enterShare(share((s) => (s.camera.target.locked = true))));

  it('cannot be left for another camera or the free camera', () => {
    const studio = useStudio.getState();
    studio.setFocusCamera(9);
    studio.setFocusCamera(null);
    studio.setCameraMode(9, 'follow');
    expect(useStudio.getState().focusCameraId).toBe(7);
  });

  it('still lets the mode of the focused camera change', () => {
    useStudio.getState().setCameraMode(7, 'firstPerson');
    expect(useStudio.getState()).toMatchObject({ focusCameraId: 7, cameraMode: 'firstPerson' });
  });

  it('does not follow the selection, which would leave the camera', () => {
    useStudio.getState().setFollow(true);
    expect(useStudio.getState()).toMatchObject({ follow: false, focusCameraId: 7 });
  });

  it('does not frame the scene or the selection while a camera is focused', () => {
    useStudio.getState().frameAll();
    useStudio.getState().frameSelected();
    expect(useStudio.getState()).toMatchObject({ frameAllRequest: 0, frameSelectedRequest: 0 });
  });

  it('frames freely when the locked target is the free camera', () => {
    useStudio.setState({ focusCameraId: null });
    useStudio.getState().frameAll();
    expect(useStudio.getState().frameAllRequest).toBe(1);
  });

  it('is not applied to the intro, which opens on the camera the owner chose', () => {
    useStudio.getState().startOnCamera(11, 'firstPerson');
    expect(useStudio.getState()).toMatchObject({ focusCameraId: 11, cameraMode: 'firstPerson' });
  });
});

describe('a locked camera mode', () => {
  it('keeps how the camera is viewed while another camera can still be picked', () => {
    useStudio.getState().enterShare(share((s) => (s.camera.mode.locked = true)));
    useStudio.getState().setCameraMode(9, 'firstPerson');
    expect(useStudio.getState()).toMatchObject({ focusCameraId: 9, cameraMode: 'follow' });
    useStudio.getState().setCameraMode(9, 'firstPerson');
    expect(useStudio.getState().cameraMode).toBe('follow');
  });
});

describe('locked view settings', () => {
  it('start with the owner\'s values and cannot be changed', () => {
    useStudio.getState().enterShare(
      share((s) => {
        s.display.grid = { value: false, locked: true };
        s.display.shadows = { value: false, locked: false };
        s.camera.fov = { value: 70, locked: true };
        s.camera.followStyle = { value: 'front', locked: true };
        s.camera.firstPersonNear = { value: 0.5, locked: true };
      }),
    );
    expect(useStudio.getState().settings).toMatchObject({ grid: false, shadows: false, fov: 70, followStyle: 'front', firstPersonNear: 0.5 });
    const studio = useStudio.getState();
    studio.setSetting('grid', true);
    studio.setSetting('fov', 30);
    studio.setSetting('followStyle', 'behind');
    studio.setSetting('firstPersonNear', null);
    studio.setSetting('shadows', true);
    expect(useStudio.getState().settings).toMatchObject({ grid: false, shadows: true, fov: 70, followStyle: 'front', firstPersonNear: 0.5 });
  });

  it('are the owner\'s again when the link is left', () => {
    useStudio.getState().enterShare(share((s) => (s.camera.fov.value = 80)));
    useStudio.getState().leaveShare();
    expect(useStudio.getState().share).toBeNull();
    expect(useStudio.getState().settings.fov).toBe(DEFAULT_VIEW_SETTINGS.fov);
  });
});

describe('remembered view settings', () => {
  const written: string[] = [];
  beforeEach(() => {
    written.length = 0;
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: (_key: string, value: string) => void written.push(value) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('are written by the owner\'s studio', () => {
    useStudio.getState().setSetting('grid', false);
    expect(written).toHaveLength(1);
  });

  it('are never written by a share page', () => {
    useStudio.getState().enterShare(DEFAULT_SHARE_SETTINGS);
    useStudio.getState().setSetting('grid', false);
    expect(useStudio.getState().settings.grid).toBe(false);
    expect(written).toHaveLength(0);
  });
});

describe('selecting', () => {
  it('does nothing when the owner turned it off, but clearing still works', () => {
    useStudio.getState().enterShare(share((s) => (s.interaction.selectObjects = false)));
    useStudio.getState().select(node());
    useStudio.getState().selectId(5);
    expect(useStudio.getState()).toMatchObject({ selected: null, selectedId: null });
    useStudio.getState().select(null);
    expect(useStudio.getState().selected).toBeNull();
  });
});

describe('locked seeking and speed', () => {
  function playback() {
    const p = new Playback();
    p.duration = 100;
    return p;
  }

  it('stop the user moving the playhead or changing the speed', () => {
    useStudio.getState().enterShare(share((s) => ((s.playback.seeking.locked = true), (s.playback.speed.locked = true))));
    const p = playback();
    seekByUser(p, 40);
    setSpeedByUser(p, 4);
    expect(p.time).toBe(0);
    expect(p.speed).toBe(1);
  });

  it('do not stop the page itself, nor play and pause', () => {
    useStudio.getState().enterShare(share((s) => ((s.playback.seeking.locked = true), (s.playback.speed.locked = true))));
    const p = playback();
    p.seek(12);
    p.setSpeed(2);
    p.setPlaying(false);
    expect(p).toMatchObject({ time: 12, speed: 2, playing: false });
  });

  it('are free when not locked', () => {
    useStudio.getState().enterShare(DEFAULT_SHARE_SETTINGS);
    const p = playback();
    seekByUser(p, 40);
    setSpeedByUser(p, 4);
    expect(p).toMatchObject({ time: 40, speed: 4 });
  });

  it('stop the intro from being replayed, which restarts from the beginning', () => {
    useStudio.getState().enterShare(share((s) => (s.playback.seeking.locked = true)));
    useStudio.getState().replayIntro();
    expect(useStudio.getState().introRequest).toBe(0);
    useStudio.getState().leaveShare();
    useStudio.getState().replayIntro();
    expect(useStudio.getState().introRequest).toBe(1);
  });
});
