import { useEffect, useState, type ReactNode } from 'react';
import type * as THREE from 'three';
import { Box, Camera, Lightbulb, Bone, Search, Sparkles } from 'lucide-react';
import { cn } from '../../ui/cn';
import { textureThumbnail } from '../../inspector/thumbnails';
import { useStudio } from '../studioStore';

/** The padded, scrolling body of a window. */
export function WindowBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-5', className)}>{children}</div>;
}

/** The quiet line at the bottom of a window: counts, a hint. */
export function WindowFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex shrink-0 items-center justify-between gap-3 border-t border-rule px-6 py-3.5 font-mono text-[12px] text-fg-3', className)}>{children}</div>;
}

/** A mono context line at the top of a window: "24 materials        Scene / Courtyard". */
export function WindowContext({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-4">
      <span className="text-[14px] text-fg-2">{left}</span>
      {right && <span className="truncate font-mono text-[12px] text-fg-3">{right}</span>}
    </div>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('eyebrow mb-3', className)}>{children}</p>;
}

export function Rule() {
  return <div className="my-5 h-px bg-rule" />;
}

/** Label left, mono value right. */
export function Row({ label, children, title }: { label: ReactNode; children: ReactNode; title?: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4 py-[7px]" title={title}>
      <dt className="shrink-0 text-[14px] text-fg-2">{label}</dt>
      <dd className="tabular min-w-0 truncate text-right font-mono text-[13px] text-fg">{children}</dd>
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="px-6 py-6 text-[14px] leading-6 text-fg-2">{children}</p>;
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="flex h-11 items-center gap-3 rounded-[8px] border border-rule-strong bg-ink-3/60 px-3.5 transition-colors focus-within:border-accent/60">
      <Search className="h-[18px] w-[18px] shrink-0 text-fg-3" />
      <input
        type="search"
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[14px] text-fg outline-none placeholder:text-fg-3"
      />
    </label>
  );
}

/** The heading block of the Inspector and Geometry windows: a typed icon, a name and a mono kind line. */
export function ObjectHeading({ icon, name, kind }: { icon: ReactNode; name: string; kind: ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="mt-1 text-accent">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[22px] font-medium leading-7 text-fg">{name}</p>
        <p className="mt-1 truncate font-mono text-[13px] text-fg-3">{kind}</p>
      </div>
    </div>
  );
}

export type NodeKind = 'mesh' | 'camera' | 'light' | 'bone' | 'group' | 'spawn';

export function kindOf(node: THREE.Object3D): NodeKind {
  if ((node as THREE.Camera).isCamera) return 'camera';
  if ((node as THREE.Light).isLight) return 'light';
  if ((node as THREE.Bone).isBone) return 'bone';
  for (const n of [node, ...node.children]) if ((n as THREE.Mesh).isMesh) return 'mesh';
  return 'group';
}

export function NodeIcon({ kind, className }: { kind: NodeKind; className?: string }) {
  const Icon = kind === 'camera' ? Camera : kind === 'light' ? Lightbulb : kind === 'bone' ? Bone : kind === 'spawn' ? Sparkles : Box;
  return <Icon className={cn('h-[18px] w-[18px] shrink-0', className)} strokeWidth={1.6} />;
}

/** A preview of a texture; a checker while it renders, and a note when it cannot be drawn. */
export function TextureThumb({ texture, size, className, max = 128 }: { texture: THREE.Texture; size?: number; className?: string; max?: number }) {
  const renderer = useStudio((s) => s.renderer);
  const [url, setUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setUrl(undefined);
    void textureThumbnail(renderer, texture, max).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [renderer, texture, max]);

  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-ink-3', className)}
      style={{ width: size, height: size, background: url ? 'repeating-conic-gradient(#3a3a37 0% 25%, #2a2a29 0% 50%) 50% / 12px 12px' : undefined }}
      data-thumb={url === undefined ? 'pending' : url ? 'ready' : 'none'}
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : url === null ? <span className="px-2 text-center font-mono text-[10px] text-fg-3">GPU only</span> : null}
    </span>
  );
}
