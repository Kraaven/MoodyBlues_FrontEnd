import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { collectTextures, TEXTURE_CHANNELS } from '../../inspector/inspection';
import { IconButton } from '../../ui/Button';
import { formatBytes, plural } from '../../lib/format';
import { useStudio } from '../studioStore';
import { EmptyNote, Row, TextureThumb, WindowBody, WindowFooter } from './parts';

const channelLabel = (key: string) => TEXTURE_CHANNELS.find((c) => c.key === key)?.label ?? key;

function colorSpaceName(space: string): string {
  if (space === 'srgb') return 'sRGB';
  if (space === 'srgb-linear') return 'Linear';
  return space === 'none' || !space ? 'Data' : space;
}

/** Every texture once, largest first: a large preview, its size and format, and what uses it. */
export function TexturesWindow() {
  const master = useStudio((s) => s.master);
  const textures = useMemo(() => (master ? collectTextures(master) : null), [master]);
  const [index, setIndex] = useState(0);

  if (!textures) return <EmptyNote>The scene is still loading.</EmptyNote>;
  if (textures.length === 0) return <EmptyNote>This scene has no textures.</EmptyNote>;

  const i = Math.min(index, textures.length - 1);
  const t = textures[i];
  const total = textures.reduce((n, x) => n + x.bytes, 0);
  const materials = [...new Set(t.uses.map((u) => u.materialName))];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WindowBody>
        <p className="pb-4 text-[14px] text-fg-2">
          {plural(textures.length, 'texture')} <span className="font-mono text-[12px] text-fg-3">· about {formatBytes(total)} on the GPU</span>
        </p>
        <TextureThumb key={t.id} texture={t.texture} max={512} className="aspect-[4/3] w-full rounded-[8px] [&_img]:object-contain" />
        <p className="mt-5 truncate text-[18px] text-fg">{t.name}</p>
        <p className="mt-1.5 font-mono text-[13px] text-fg-3">
          {t.width > 0 ? `${t.width} × ${t.height}` : 'size unknown'}
          <span className="mx-2.5 text-fg-3/60">/</span>
          {colorSpaceName(t.colorSpace)}
          <span className="mx-2.5 text-fg-3/60">/</span>
          {t.compressed ? 'GPU compressed' : 'Image'}
        </p>
        <dl className="mt-4">
          <Row label="Used by" title={materials.join(', ')}>
            <span className="font-sans text-[14px]">{materials.slice(0, 2).join(', ')}{materials.length > 2 ? ` +${materials.length - 2}` : ''}</span>
          </Row>
          <Row label="As">{[...new Set(t.uses.map((u) => channelLabel(u.channel).replace(' map', '')))].join(', ')}</Row>
          <Row label="GPU memory">{formatBytes(t.bytes)}</Row>
        </dl>
        {t.compressed && <p className="mt-3 text-[12px] text-fg-3">Compressed for the GPU (KTX2): the preview is drawn through the 3D view.</p>}
      </WindowBody>
      <WindowFooter>
        <span className="tabular">
          {i + 1} of {textures.length}
        </span>
        <div className="flex gap-1">
          <IconButton label="Previous texture" size="sm" disabled={i === 0} onClick={() => setIndex(i - 1)}>
            <ArrowLeft className="h-4 w-4" />
          </IconButton>
          <IconButton label="Next texture" size="sm" disabled={i >= textures.length - 1} onClick={() => setIndex(i + 1)}>
            <ArrowRight className="h-4 w-4" />
          </IconButton>
        </div>
      </WindowFooter>
    </div>
  );
}
