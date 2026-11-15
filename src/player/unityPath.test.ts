import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { unityPath } from './unityPath';

function node(name: string, id?: number): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  if (id !== undefined) o.userData.objectId = id;
  return o;
}

describe('unityPath', () => {
  it('joins the names from the scene root down, leaving the root itself out', () => {
    const root = node('Scene');
    const arena = node('Arena', 1);
    const crate = node('Crate_A', 3);
    root.add(arena);
    arena.add(crate);
    expect(unityPath(crate, root)).toBe('Arena/Crate_A');
    expect(unityPath(arena, root)).toBe('Arena');
  });

  it('adds the ObjectID to a name a sibling shares', () => {
    const root = node('Scene');
    const a = node('Crate', 4);
    const b = node('Crate', 5);
    root.add(a, b);
    expect(unityPath(a, root)).toBe('Crate #4');
    expect(unityPath(b, root)).toBe('Crate #5');
  });

  it('does not decorate a name that is unique among its siblings', () => {
    const root = node('Scene');
    const group = node('Props', 1);
    const a = node('Crate', 4);
    const b = node('Barrel', 5);
    root.add(group);
    group.add(a, b);
    expect(unityPath(a, root)).toBe('Props/Crate');
  });

  it('names an unnamed tracked node by its id', () => {
    const root = node('Scene');
    const unnamed = node('', 9);
    root.add(unnamed);
    expect(unityPath(unnamed, root)).toBe('Object 9');
  });
});
