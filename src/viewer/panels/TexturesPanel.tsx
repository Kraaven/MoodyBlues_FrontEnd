import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ImageOff } from 'lucide-react';
import { useViewerStore } from '../viewerStore';

const FORMAT_NAMES: Partial<Record<number, string>> = {
  [THREE.RGBAFormat]: 'RGBA',
  [THREE.RGBFormat]: 'RGB',
  [THREE.RedFormat]: 'Red',
};

function isDrawableImage(image: unknown): image is HTMLImageElement | HTMLCanvasElement | ImageBitmap {
  return (
    typeof HTMLImageElement !== 'undefined' && image instanceof HTMLImageElement ||
    (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) ||
    (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap)
  );
}

function TextureThumbnail({ texture }: { texture: THREE.Texture }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawFailed, setDrawFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = texture.image as unknown;
    if (!canvas || !isDrawableImage(image)) {
      setDrawFailed(true);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setDrawFailed(true);
      return;
    }

    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      setDrawFailed(false);
    } catch {
      setDrawFailed(true);
    }
  }, [texture]);

  const width = (texture.image as { width?: number })?.width;
  const height = (texture.image as { height?: number })?.height;

  return (
    <div className="rounded-lg border border-hairline bg-canvas-raised/60 p-2">
      <div className="mb-2 flex h-24 items-center justify-center overflow-hidden rounded-md bg-surface-soft">
        {drawFailed ? (
          <ImageOff className="h-6 w-6 text-ink-faint" />
        ) : (
          <canvas ref={canvasRef} width={96} height={96} className="h-full w-full object-contain" />
        )}
      </div>
      <p className="truncate text-xs font-medium text-ink">{texture.name || '(unnamed texture)'}</p>
      <p className="text-[10px] text-ink-faint">
        {width && height ? `${width}x${height}` : 'unknown size'}
        {texture.format in FORMAT_NAMES ? ` - ${FORMAT_NAMES[texture.format]}` : ''}
      </p>
    </div>
  );
}

export function TexturesPanel() {
  const textures = useViewerStore((s) => s.textures);

  if (textures.length === 0) {
    return <p className="text-center text-sm text-ink-muted">No textures found.</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {textures.map((texture) => (
        <TextureThumbnail key={texture.uuid} texture={texture} />
      ))}
    </div>
  );
}
