import { BarChart3, Image, Layers } from 'lucide-react';
import { useViewerStore } from './viewerStore';
import type { PanelId } from './viewerStore';
import type { TabItem } from '../components/ui/Tabs';
import { Tabs } from '../components/ui/Tabs';
import { MaterialsPanel } from './panels/MaterialsPanel';
import { TexturesPanel } from './panels/TexturesPanel';
import { StatisticsPanel } from './panels/StatisticsPanel';

const TABS: TabItem<PanelId>[] = [
  { id: 'materials', label: 'Materials', icon: Layers },
  { id: 'textures', label: 'Textures', icon: Image },
  { id: 'statistics', label: 'Stats', icon: BarChart3 },
];

export function ViewerSidebar() {
  const activePanel = useViewerStore((s) => s.activePanel);
  const setActivePanel = useViewerStore((s) => s.setActivePanel);
  const gltf = useViewerStore((s) => s.gltf);

  return (
    <aside className="absolute inset-y-0 right-0 flex w-72 flex-col border-l border-hairline bg-canvas-raised">
      <Tabs items={TABS} activeId={activePanel} onChange={setActivePanel} />

      <div className="flex-1 overflow-y-auto p-2.5">
        {!gltf ? (
          <p className="mt-8 text-center text-sm text-ink-muted">Waiting for model to load...</p>
        ) : (
          <>
            {activePanel === 'materials' && <MaterialsPanel />}
            {activePanel === 'textures' && <TexturesPanel />}
            {activePanel === 'statistics' && <StatisticsPanel />}
          </>
        )}
      </div>
    </aside>
  );
}
