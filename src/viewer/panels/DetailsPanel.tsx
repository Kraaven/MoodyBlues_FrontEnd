import { useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, Image, Layers } from 'lucide-react';
import { useViewerStore } from '../viewerStore';
import { InspectorPanel } from './InspectorPanel';
import { MaterialsPanel } from './MaterialsPanel';
import { TexturesPanel } from './TexturesPanel';
import { StatisticsPanel } from './StatisticsPanel';

type DetailTab = 'inspector' | 'materials' | 'textures' | 'stats';

export function DetailsPanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<DetailTab>('inspector');
  const gltf = useViewerStore((s) => s.gltf);

  if (!gltf) return null;

  return (
    <div className={`flex flex-col border-l border-hairline bg-canvas-raised transition-all duration-200 ${collapsed ? 'w-10' : 'w-60'}`}>
      <div className="flex h-8 items-center justify-between border-b border-hairline px-2">
        {!collapsed && <span className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">Details</span>}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded p-0.5 text-ink-faint transition hover:text-ink"
        >
          {collapsed ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="flex border-b border-hairline">
            {([
              { id: 'inspector' as const, label: 'Inspect', icon: null },
              { id: 'materials' as const, label: 'Mats', icon: Layers },
              { id: 'textures' as const, label: 'Tex', icon: Image },
              { id: 'stats' as const, label: 'Stats', icon: BarChart3 },
            ]).map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  title={t.label}
                  onClick={() => setTab(t.id)}
                  className={`flex flex-1 items-center justify-center gap-1 border-b-2 py-1.5 text-[10px] font-medium transition ${
                    active ? 'border-accent text-ink' : 'border-transparent text-ink-faint hover:text-ink-muted'
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  {t.label}
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {tab === 'inspector' && <InspectorPanel />}
            {tab === 'materials' && <MaterialsPanel />}
            {tab === 'textures' && <TexturesPanel />}
            {tab === 'stats' && <StatisticsPanel />}
          </div>
        </>
      )}
    </div>
  );
}
