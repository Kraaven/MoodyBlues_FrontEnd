import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FADE_IN, FADE_OPACITY, FADE_OUT, MAX_FADED, OccluderFade, originalMaterials } from './occluderFade';

const mesh = (material: THREE.Material | THREE.Material[]) => new THREE.Mesh(new THREE.BoxGeometry(), material);
const run = (fade: OccluderFade, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) fade.step(dt);
};
const opacityOf = (m: THREE.Mesh) => (m.material as THREE.Material).opacity;

describe('OccluderFade', () => {
  it('fades a blocker to about a fifth in a quarter of a second', () => {
    const fade = new OccluderFade();
    const m = mesh(new THREE.MeshStandardMaterial());
    fade.set([m]);
    run(fade, FADE_IN / 2);
    expect(opacityOf(m)).toBeGreaterThan(FADE_OPACITY);
    expect(opacityOf(m)).toBeLessThan(1);
    run(fade, FADE_IN);
    expect(opacityOf(m)).toBeCloseTo(FADE_OPACITY);
    expect((m.material as THREE.Material).transparent).toBe(true);
    expect((m.material as THREE.Material).depthWrite).toBe(false);
  });

  it('reports animating while fading and stops asking once settled', () => {
    const fade = new OccluderFade();
    fade.set([mesh(new THREE.MeshStandardMaterial())]);
    expect(fade.step(0.05)).toBe(true);
    run(fade, 1);
    expect(fade.step(1 / 60)).toBe(false);
  });

  it('fades back in 0.4 s and then restores and disposes the copy', () => {
    const fade = new OccluderFade();
    const original = new THREE.MeshStandardMaterial();
    const m = mesh(original);
    fade.set([m]);
    run(fade, 1);
    const copy = m.material as THREE.Material;
    let disposed = false;
    copy.addEventListener('dispose', () => (disposed = true));
    fade.set([]);
    run(fade, FADE_OUT / 2);
    expect(m.material).toBe(copy);
    expect(opacityOf(m)).toBeGreaterThan(FADE_OPACITY);
    run(fade, FADE_OUT);
    expect(m.material).toBe(original);
    expect(disposed).toBe(true);
    expect(fade.step(1 / 60)).toBe(false);
  });

  it('never changes a shared material', () => {
    const shared = new THREE.MeshStandardMaterial({ opacity: 0.9, transparent: false });
    const a = mesh(shared);
    const b = mesh(shared);
    const fade = new OccluderFade();
    fade.set([a]);
    run(fade, 1);
    expect(shared.opacity).toBe(0.9);
    expect(shared.transparent).toBe(false);
    expect(shared.depthWrite).toBe(true);
    expect(b.material).toBe(shared);
    expect(a.material).not.toBe(shared);
    expect(opacityOf(a)).toBeCloseTo(0.9 * FADE_OPACITY);
    fade.set([]);
    run(fade, 1);
    expect(shared.opacity).toBe(0.9);
  });

  it('copes with several materials on a mesh', () => {
    const one = new THREE.MeshStandardMaterial({ opacity: 0.5 });
    const two = new THREE.MeshBasicMaterial();
    const m = mesh([one, two]);
    const fade = new OccluderFade();
    fade.set([m]);
    run(fade, 1);
    const copies = m.material as THREE.Material[];
    expect(copies).toHaveLength(2);
    expect(copies[0].opacity).toBeCloseTo(0.5 * FADE_OPACITY);
    expect(copies[1].opacity).toBeCloseTo(FADE_OPACITY);
    expect(originalMaterials(m)).toEqual([one, two]);
    fade.set([]);
    run(fade, 1);
    expect(m.material).toEqual([one, two]);
    expect(one.opacity).toBe(0.5);
  });

  it('restores everything at once on clear', () => {
    const fade = new OccluderFade();
    const original = new THREE.MeshStandardMaterial();
    const m = mesh(original);
    fade.set([m]);
    run(fade, 0.1);
    fade.clear();
    expect(m.material).toBe(original);
    expect(originalMaterials(m)).toEqual([original]);
    expect(fade.step(1 / 60)).toBe(false);
  });

  it('keeps a mesh that blocks again mid way fading from where it is', () => {
    const fade = new OccluderFade();
    const m = mesh(new THREE.MeshStandardMaterial());
    fade.set([m]);
    run(fade, 1);
    fade.set([]);
    run(fade, 0.1);
    const mid = opacityOf(m);
    fade.set([m]);
    run(fade, 1 / 60);
    expect(opacityOf(m)).toBeLessThan(mid);
    expect(opacityOf(m)).toBeGreaterThan(FADE_OPACITY);
  });

  it('follows the original wireframe flag', () => {
    const original = new THREE.MeshStandardMaterial();
    const m = mesh(original);
    const fade = new OccluderFade();
    fade.set([m]);
    original.wireframe = true;
    fade.step(1 / 60);
    expect((m.material as THREE.MeshStandardMaterial).wireframe).toBe(true);
  });

  it('fades at most a few meshes', () => {
    const meshes = Array.from({ length: MAX_FADED + 4 }, () => mesh(new THREE.MeshStandardMaterial()));
    const fade = new OccluderFade();
    fade.set(meshes);
    expect(meshes.filter((m) => originalMaterials(m)[0] !== m.material).length).toBe(MAX_FADED);
  });
});
