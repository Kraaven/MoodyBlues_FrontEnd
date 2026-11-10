import { useEffect, useState, type ReactNode } from 'react';
import type * as THREE from 'three';
import { ImageOff } from 'lucide-react';
import { cn } from '../../ui/cn';
import { textureThumbnail } from '../thumbnails';
import { useInspector } from '../inspectorStore';

export function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-fg-3">{k}</dt>
          <dd className="tabular min-w-0 truncate text-right font-mono text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Swatch({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden="true" className={cn('inline-block h-3 w-3 rounded-full border border-white/20 align-middle', className)} style={{ background: color }} />;
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="p-4 text-[13px] text-fg-2">{children}</p>;
}

/** A small preview of a texture; a checker box while it renders, and a muted icon when it cannot be drawn. */
export function TextureThumb({ texture, size = 40, label }: { texture: THREE.Texture; size?: number; label?: string }) {
  const renderer = useInspector((s) => s.renderer);
  const [url, setUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setUrl(undefined);
    void textureThumbnail(renderer, texture, Math.max(64, size * 2)).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [renderer, texture, size]);

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[5px] border border-rule-strong bg-ink-3"
      style={{ width: size, height: size, background: url ? 'repeating-conic-gradient(#273866 0% 25%, #151e36 0% 50%) 50% / 8px 8px' : undefined }}
      data-thumb={url === undefined ? 'pending' : url ? 'ready' : 'none'}
    >
      {url ? (
        <img src={url} alt={label ?? 'Texture preview'} className="h-full w-full object-contain" />
      ) : url === null ? (
        <ImageOff className="h-4 w-4 text-fg-3" aria-label="No preview available" />
      ) : null}
    </span>
  );
}
