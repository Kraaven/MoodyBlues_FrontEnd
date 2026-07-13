import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { PanelType } from './viewerStore';

const MIN_W = 260;
const MIN_H = 220;
const DEFAULT_SIZES: Record<PanelType, { w: number; h: number }> = {
  hierarchy: { w: 300, h: 400 },
  inspector: { w: 320, h: 440 },
  materials: { w: 320, h: 380 },
  stats: { w: 300, h: 420 },
};

function defaultPosition(type: PanelType) {
  const viewW = window.innerWidth;
  const viewH = window.innerHeight;
  const sz = DEFAULT_SIZES[type];
  if (type === 'hierarchy') return { x: 60, y: viewH / 2 - sz.h / 2 };
  if (type === 'stats') return { x: viewW - sz.w - 60, y: viewH / 2 - sz.h / 2 };
  return { x: viewW - sz.w - 40, y: 100 };
}

export function FloatingPanel({
  type,
  title,
  children,
  onClose,
}: {
  type: PanelType;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const defSz = DEFAULT_SIZES[type];
  const [pos, setPos] = useState(() => defaultPosition(type));
  const [size, setSize] = useState({ w: defSz.w, h: defSz.h });
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const onTitleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startY: e.clientY, posX: pos.x, posY: pos.y };
    },
    [pos],
  );

  const onResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };
    },
    [size],
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragRef.current) {
        setPos({
          x: dragRef.current.posX + (e.clientX - dragRef.current.startX),
          y: dragRef.current.posY + (e.clientY - dragRef.current.startY),
        });
      }
      if (resizeRef.current) {
        setSize({
          w: Math.max(MIN_W, resizeRef.current.startW + (e.clientX - resizeRef.current.startX)),
          h: Math.max(MIN_H, resizeRef.current.startH + (e.clientY - resizeRef.current.startY)),
        });
      }
    };

    const onMouseUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  return (
    <div
      ref={panelRef}
      className="fixed z-40 flex flex-col rounded-lg border border-hairline bg-canvas-raised shadow-lg shadow-black/40"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h, minWidth: MIN_W, minHeight: MIN_H }}
    >
      <div
        onMouseDown={onTitleMouseDown}
        className="flex h-8 shrink-0 cursor-grab items-center justify-between border-b border-hairline px-3 active:cursor-grabbing"
      >
        <span className="font-mono text-[10px] uppercase tracking-wide text-ink-faint select-none">{title}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-ink-faint transition hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">{children}</div>
      <div
        onMouseDown={onResizeMouseDown}
        className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize rounded-bl"
        style={{
          background:
            'linear-gradient(135deg, transparent 40%, var(--color-hairline) 40%, var(--color-hairline) 46%, transparent 46%, transparent 54%, var(--color-hairline) 54%, var(--color-hairline) 60%, transparent 60%)',
        }}
      />
    </div>
  );
}
