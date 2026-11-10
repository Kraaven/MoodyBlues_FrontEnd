import * as THREE from 'three';
import { framePose } from '../viewer/core/gltf';
import { beginSnapshot, getSnapshotUrl, storeSnapshot } from './snapshots';

// Kept apart from snapshots.ts so the lists that only show snapshots do not pull in three.js.
const WIDTH = 640;
const HEIGHT = 360;

/**
 * Renders `root` from a fixed, flattering angle into a 640 x 360 image and stores it. The root is
 * already in `scene`; nothing about it is changed. Runs once per scene version.
 */
export async function captureSnapshot(renderer: THREE.WebGLRenderer, scene: THREE.Scene, root: THREE.Object3D, hash: string): Promise<void> {
  if (!beginSnapshot(hash)) return;
  const existing = await getSnapshotUrl(hash);
  if (existing !== null) {
    console.debug('[stage] snapshot already stored for', hash.slice(0, 8));
    return;
  }
  console.debug('[stage] capturing snapshot for', hash.slice(0, 8));

  let target: THREE.WebGLRenderTarget | null = null;
  try {
    const camera = new THREE.PerspectiveCamera(38, WIDTH / HEIGHT, 0.05, 5000);
    const pose = framePose(root, camera.fov, { direction: new THREE.Vector3(1, 0.65, 1.15), padding: 1.05 });
    if (!pose) return;
    camera.position.set(...pose.position);
    camera.near = Math.max(0.01, pose.distance / 1000);
    camera.far = Math.max(1000, pose.distance * 20);
    camera.lookAt(...pose.target);
    camera.updateProjectionMatrix();

    // sRGB so the pixels read back are already display-ready.
    target = new THREE.WebGLRenderTarget(WIDTH, HEIGHT, { samples: 4 });
    target.texture.colorSpace = THREE.SRGBColorSpace;

    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(previous);

    const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
    renderer.readRenderTargetPixels(target, 0, 0, WIDTH, HEIGHT, pixels);

    // Pixel rows come bottom-up.
    const flipped = new Uint8ClampedArray(pixels.length);
    const row = WIDTH * 4;
    for (let y = 0; y < HEIGHT; y++) flipped.set(pixels.subarray((HEIGHT - 1 - y) * row, (HEIGHT - y) * row), y * row);
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.getContext('2d')!.putImageData(new ImageData(flipped, WIDTH, HEIGHT), 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
    if (!blob) {
      console.debug('[stage] snapshot: the browser produced no image');
      return;
    }
    if (await storeSnapshot(hash, blob)) console.debug('[stage] snapshot stored,', blob.size, 'bytes');
  } catch (err) {
    // A failed capture just means the placeholder stays.
    console.debug('[stage] snapshot capture failed:', err);
  } finally {
    target?.dispose();
  }
}

