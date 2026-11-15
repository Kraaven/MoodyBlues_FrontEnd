import type * as THREE from 'three';

/**
 * The Hierarchy path of a node as Unity shows it, `Arena/Crate_A`. Where a node shares its name with a
 * sibling the path alone would be ambiguous, so that segment also carries its ObjectID: `Crate #12`.
 */
export function unityPath(node: THREE.Object3D, root: THREE.Object3D): string {
  const parts: string[] = [];
  for (let n: THREE.Object3D | null = node; n && n !== root; n = n.parent) {
    const id = n.userData?.objectId;
    const name = n.name || (typeof id === 'number' ? `Object ${id}` : 'Unnamed');
    const shared = n.parent ? n.parent.children.some((c) => c !== n && c.name === n.name) : false;
    parts.push(shared && typeof id === 'number' ? `${name} #${id}` : name);
  }
  return parts.reverse().join('/');
}
