import { Activity, Box, Image, Layers, Settings, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useViewerStore } from './viewerStore';
import type { PanelId } from './viewerStore';
import { HierarchyPanel } from './panels/HierarchyPanel';
import { MaterialsPanel } from './panels/MaterialsPanel';
import { TexturesPanel } from './panels/TexturesPanel';
import { GeometryPanel } from './panels/GeometryPanel';
import { AnimationsPanel } from './panels/AnimationsPanel';
import { SettingsPanel } from './panels/SettingsPanel';

const TABS: { id: PanelId; label: string; icon: LucideIcon }[] = [
  { id: 'hierarchy', label: 'Hierarchy', icon: Workflow },
  { id: 'materials', label: 'Materials', icon: Layers },
  { id: 'textures', label: 'Textures', icon: Image },
  { id: 'geometry', label: 'Geometry', icon: Box },
  { id: 'animations', label: 'Animations', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function ViewerSidebar() {
  const activePanel = useViewerStore((s) => s.activePanel);
  const setActivePanel = useViewerStore((s) => s.setActivePanel);
  const gltf = useViewerStore((s) => s.gltf);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-white/10 bg-[#0e0e12]">
      <div className="flex border-b border-white/10">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activePanel === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              title={tab.label}
              onClick={() => setActivePanel(tab.id)}
              className={`flex flex-1 flex-col items-center gap-1 border-b-2 py-2.5 text-[10px] transition ${
                isActive ? 'border-violet-400 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {!gltf ? (
          <p className="mt-8 text-center text-sm text-zinc-500">Waiting for model to load...</p>
        ) : (
          <>
            {activePanel === 'hierarchy' && <HierarchyPanel />}
            {activePanel === 'materials' && <MaterialsPanel />}
            {activePanel === 'textures' && <TexturesPanel />}
            {activePanel === 'geometry' && <GeometryPanel />}
            {activePanel === 'animations' && <AnimationsPanel />}
            {activePanel === 'settings' && <SettingsPanel />}
          </>
        )}
      </div>
    </aside>
  );
}
