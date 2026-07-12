import { Activity, BarChart3, Image, Layers, MousePointerClick, Workflow } from 'lucide-react';
import { useViewerStore } from './viewerStore';
import type { PanelId } from './viewerStore';
import type { TabItem } from '../components/ui/Tabs';
import { Tabs } from '../components/ui/Tabs';
import { HierarchyPanel } from './panels/HierarchyPanel';
import { InspectorPanel } from './panels/InspectorPanel';
import { MaterialsPanel } from './panels/MaterialsPanel';
import { TexturesPanel } from './panels/TexturesPanel';
import { AnimationsPanel } from './panels/AnimationsPanel';
import { StatisticsPanel } from './panels/StatisticsPanel';

const TABS: TabItem<PanelId>[] = [
  { id: 'hierarchy', label: 'Hierarchy', icon: Workflow },
  { id: 'inspector', label: 'Inspector', icon: MousePointerClick },
  { id: 'materials', label: 'Materials', icon: Layers },
  { id: 'textures', label: 'Textures', icon: Image },
  { id: 'animations', label: 'Animations', icon: Activity },
  { id: 'statistics', label: 'Stats', icon: BarChart3 },
];

export function ViewerSidebar() {
  const activePanel = useViewerStore((s) => s.activePanel);
  const setActivePanel = useViewerStore((s) => s.setActivePanel);
  const gltf = useViewerStore((s) => s.gltf);

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-hairline bg-canvas-raised">
      <Tabs items={TABS} activeId={activePanel} onChange={setActivePanel} />

      <div className="flex-1 overflow-y-auto p-3">
        {!gltf ? (
          <p className="mt-8 text-center text-sm text-ink-muted">Waiting for model to load...</p>
        ) : (
          <>
            {activePanel === 'hierarchy' && <HierarchyPanel />}
            {activePanel === 'inspector' && <InspectorPanel />}
            {activePanel === 'materials' && <MaterialsPanel />}
            {activePanel === 'textures' && <TexturesPanel />}
            {activePanel === 'animations' && <AnimationsPanel />}
            {activePanel === 'statistics' && <StatisticsPanel />}
          </>
        )}
      </div>
    </aside>
  );
}
