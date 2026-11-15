import * as THREE from 'three';

/**
 * Small preview images of textures for the inspector (DESIGN.md 7.8).
 *
 * An ordinary decoded image is drawn to a canvas. A texture that was transcoded for the GPU
 * (KTX2 / Basis) has no image a canvas can draw, so it is rendered through the Stage's renderer into a
 * render target and read back, the technique glb-viewer-core uses. `?thumbnails=gpu` forces that path
 * for every texture, to test it on scenes whose textures are ordinary images.
 */

const cache = new Map<string, Promise<string | null>>();

function drawable(source: unknown): source is CanvasImageSource & { width: number; height: number } {
  return (
    (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) ||
    source instanceof HTMLImageElement ||
    source instanceof HTMLCanvasElement ||
    (typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas)
  );
}

function fit(width: number, height: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

function fromImage(image: CanvasImageSource & { width: number; height: number }, max: number): string | null {
  const { w, h } = fit(image.width, image.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}

function fromGpu(renderer: THREE.WebGLRenderer, texture: THREE.Texture, width: number, height: number, max: number): string | null {
  if (width <= 0 || height <= 0) return null;
  const { w, h } = fit(width, height, max);
  const target = new THREE.WebGLRenderTarget(w, h);
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  try {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(previous);

    const pixels = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(target, 0, 0, w, h, pixels);
    // Rows are read bottom-up. glTF textures are stored top-down (flipY false), so the bottom row of
    // the render is the top row of the image, and reading in order is already the right way up.
    const rows = new Uint8ClampedArray(pixels.length);
    const stride = w * 4;
    for (let y = 0; y < h; y++) {
      const from = texture.flipY ? (h - 1 - y) * stride : y * stride;
      rows.set(pixels.subarray(from, from + stride), y * stride);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.putImageData(new ImageData(rows, w, h), 0, 0);
    return canvas.toDataURL('image/png');
  } finally {
    target.dispose();
    material.dispose();
    quad.geometry.dispose();
  }
}

/** A data URL for a preview of `texture`, or null when it cannot be drawn. Cached per image source. */
export function textureThumbnail(renderer: THREE.WebGLRenderer | null, texture: THREE.Texture, max = 128): Promise<string | null> {
  const forceGpu = new URLSearchParams(window.location.search).get('thumbnails') === 'gpu';
  const key = `${texture.source.uuid}:${max}:${forceGpu}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      try {
        const data = texture.source?.data ?? texture.image;
        const size = data as { width?: number; height?: number } | undefined;
        if (!forceGpu && drawable(data)) return fromImage(data, max);
        const mip = (texture as THREE.CompressedTexture).mipmaps?.[0] as { width?: number; height?: number } | undefined;
        const width = size?.width ?? mip?.width ?? 0;
        const height = size?.height ?? mip?.height ?? 0;
        return renderer ? fromGpu(renderer, texture, width, height, max) : null;
      } catch (err) {
        console.debug('[inspector] could not make a texture thumbnail:', err);
        return null;
      }
    })();
    cache.set(key, pending);
  }
  return pending;
}
