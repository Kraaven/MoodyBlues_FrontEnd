import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useViewerStore } from '../viewerStore';
import { HierarchyPanel } from './HierarchyPanel';

export function SceneTreePanel() {
  const [collapsed, setCollapsed] = useState(false);
  const gltf = useViewerStore((s) => s.gltf);

  if (!gltf) return null;

  return (
    <div className={`flex flex-col border-r border-hairline bg-canvas-raised transition-all duration-200 ${collapsed ? 'w-10' : 'w-56'}`}>
      <div className="flex h-8 items-center justify-between border-b border-hairline px-2">
        {!collapsed && <span className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">Hierarchy</span>}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded p-0.5 text-ink-faint transition hover:text-ink"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>
      {!collapsed && (
        <div className="flex-1 overflow-y-auto p-2">
          <HierarchyPanel />
        </div>
      )}
    </div>
  );
}
