import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { directionalLightsOf, findSunLight, lightBakeOf, lightEnabled, skipDirectionalOnLightmapped, towardsSun } from './lightRules';

describe('skipDirectionalOnLightmapped', () => {
  it('skips when every directional light is baked', () => {
    expect(skipDirectionalOnLightmapped([{ bake: 'baked' }], null)).toBe(true);
    expect(skipDirectionalOnLightmapped([{ bake: 'baked' }, { bake: 'baked' }], 'indirect')).toBe(true);
  });
  it('skips mixed lights only under subtractive mixed lighting', () => {
    expect(skipDirectionalOnLightmapped([{ bake: 'mixed' }], 'subtractive')).toBe(true);
    expect(skipDirectionalOnLightmapped([{ bake: 'mixed' }], 'shadowmask')).toBe(false);
    expect(skipDirectionalOnLightmapped([{ bake: 'mixed' }], 'indirect')).toBe(false);
    expect(skipDirectionalOnLightmapped([{ bake: 'mixed' }], null)).toBe(false);
  });
  it('keeps directional lights when any is realtime', () => {
    expect(skipDirectionalOnLightmapped([{ bake: 'baked' }, { bake: 'realtime' }], 'subtractive')).toBe(false);
  });
  it('does not skip when there are no directional lights', () => {
    expect(skipDirectionalOnLightmapped([], 'subtractive')).toBe(false);
  });
});

function lightUnder(bake: string | undefined, hidden = false): { holder: THREE.Object3D; light: THREE.DirectionalLight } {
  const holder = new THREE.Object3D();
  holder.userData = { ...(bake ? { lightBake: bake } : {}), ...(hidden ? { isHidden: true } : {}) };
  const light = new THREE.DirectionalLight();
  holder.add(light);
  return { holder, light };
}

describe('lights', () => {
  it('reads the bake mode from the light or its node, defaulting to realtime', () => {
    expect(lightBakeOf(lightUnder('baked').light)).toBe('baked');
    expect(lightBakeOf(lightUnder(undefined).light)).toBe('realtime');
    expect(lightBakeOf(lightUnder('weird').light)).toBe('realtime');
  });

  it('turns baked lights off in the game look only', () => {
    const { light } = lightUnder('baked');
    expect(lightEnabled(light, true, 'game')).toBe(false);
    expect(lightEnabled(light, true, 'studio')).toBe(true);
    expect(lightEnabled(lightUnder('mixed').light, true, 'game')).toBe(true);
    expect(lightEnabled(lightUnder('realtime').light, false, 'game')).toBe(false);
  });

  it('keeps a light the scene marked inactive off', () => {
    const { holder } = lightUnder(undefined);
    holder.userData.isHidden = true;
    const light = holder.children[0];
    light.userData.isHidden = true;
    expect(lightEnabled(light, true, 'game')).toBe(false);
  });

  it('lists directional lights with their bake mode', () => {
    const root = new THREE.Group();
    root.add(lightUnder('baked').holder, lightUnder('mixed').holder, new THREE.PointLight());
    expect(directionalLightsOf(root)).toEqual([{ bake: 'baked' }, { bake: 'mixed' }]);
  });

  it('finds the sun light by its node ObjectID', () => {
    const root = new THREE.Group();
    const a = lightUnder(undefined);
    a.holder.userData.objectId = 7;
    const b = lightUnder(undefined);
    b.holder.userData.objectId = 9;
    root.add(a.holder, b.holder);
    expect(findSunLight(root, 9)).toBe(b.light);
    expect(findSunLight(root, 1)).toBeNull();
    expect(findSunLight(root, null)).toBeNull();
  });

  it('points towards the sun opposite to where the node looks (-Z)', () => {
    const node = new THREE.Object3D();
    // Facing straight down: -Z maps to -Y, so the sun is overhead.
    node.rotation.x = -Math.PI / 2;
    node.updateMatrixWorld(true);
    const to = towardsSun(node);
    expect(to.x).toBeCloseTo(0);
    expect(to.y).toBeCloseTo(1);
    expect(to.z).toBeCloseTo(0);
  });
});
