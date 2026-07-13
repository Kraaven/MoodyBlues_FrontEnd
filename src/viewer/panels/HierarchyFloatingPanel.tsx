import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useViewerStore } from '../viewerStore';
import { HierarchyPanel } from './HierarchyPanel';

export function HierarchyFloatingPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const gltf = useViewerStore((s) => s.gltf);

  if (!gltf) return null;

  return (
    <div className="absolute left-3 top-3 z-10 max-h-[calc(100vh-12rem)] w-64 overflow-hidden rounded-lg border border-hairline bg-canvas-raised/90 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">Hierarchy</span>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded p-0.5 text-ink-faint transition hover:text-ink"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>
      {!collapsed && (
        <div className="max-h-[calc(100vh-17rem)] overflow-y-auto p-2.5">
          <HierarchyPanel />
        </div>
      )}
    </div>
  );
}
