import * as THREE from 'three';

const TEXTURES_PER_SLICE = 6;

function texturesOf(root: THREE.Object3D): THREE.Texture[] {
  const found = new Set<THREE.Texture>();
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) found.add(value);
    }
  });
  return [...found];
}

/**
 * Makes the first frame of a loaded scene cheap: compiles every shader it needs (without blocking,
 * where the browser can compile in parallel) and uploads its textures, a few at a time so the page
 * stays responsive. `root` need not be in `scene` yet; `scene` supplies the lights and environment
 * the programs are built against. Stops early when `alive()` turns false.
 */
export async function warmUp(
  renderer: THREE.WebGLRenderer,
  root: THREE.Object3D,
  camera: THREE.Camera,
  scene: THREE.Scene,
  alive: () => boolean,
): Promise<void> {
  try {
    await renderer.compileAsync(root, camera, scene);
  } catch (err) {
    // A failed warm-up only costs the first frame its hitch.
    console.debug('[stage] shader warm-up failed:', err);
  }
  const textures = texturesOf(root);
  for (let i = 0; i < textures.length && alive(); i += TEXTURES_PER_SLICE) {
    for (const texture of textures.slice(i, i + TEXTURES_PER_SLICE)) renderer.initTexture(texture);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}
