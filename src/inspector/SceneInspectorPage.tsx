import { useEffect, useMemo, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Activity, Boxes, Braces, Grid3x3, Image, ListTree, Maximize, LocateFixed, MoreHorizontal, Palette, X } from 'lucide-react';
import { useProject, useScene } from '../api/queries';
import type { SceneVersion } from '../api/types';
import { DockReveal, FloatingPanels, PanelDock, PanelRail, type PanelDef } from '../panels/PanelHost';
import { panelActions } from '../panels/panelStore';
import { Chrome } from '../stage/Chrome';
import { StageNotice } from '../stage/StageNotice';
import { StageSurface } from '../stage/StageSurface';
import { useStage, type StageView } from '../stage/store';
import { useStageRegion } from '../stage/useStageInset';
import { useStageView } from '../stage/useStageView';
import { useWindowTitle } from '../lib/useWindowTitle';
import { formatBytes, sceneTitle } from '../lib/format';
import { IconButton } from '../ui/Button';
import { VersionChip } from '../ui/Chip';
import { Menu } from '../ui/Menu';
import { ErrorState } from '../ui/States';
import { nodeType } from './inspection';
import { useInspector } from './inspectorStore';
import { GeometriesPanel } from './panels/GeometriesPanel';
import { HierarchyPanel } from './panels/HierarchyPanel';
import { MaterialsPanel } from './panels/MaterialsPanel';
import { RawPanel } from './panels/RawPanel';
import { StatsPanel } from './panels/StatsPanel';
import { TexturesPanel } from './panels/TexturesPanel';

const SCOPE = 'inspector';

/** The scene inspector (DESIGN.md 7.8): the player's layout without a timeline. */
export default function SceneInspectorPage() {
  const { projectId, sceneId } = useParams<{ projectId: string; sceneId: string }>();
  const [params] = useSearchParams();
  const project = useProject(projectId);
  const scene = useScene(project.data?.developerId, sceneId);
  const region = useRef<HTMLDivElement>(null);
  const sceneState = useStage((s) => s.scene);
  const selected = useInspector((s) => s.selected);
  const showGrid = useInspector((s) => s.showGrid);
  const ready = useInspector((s) => s.root !== null);

  const requested = Number(params.get('version'));
  const version: SceneVersion | null = useMemo(() => {
    if (!scene.data) return null;
    const all = [scene.data.current, ...scene.data.archived].filter((v): v is SceneVersion => v !== null);
    return all.find((v) => v.version === requested) ?? scene.data.current;
  }, [scene.data, requested]);

  const sceneRef = useMemo(
    () => (project.data && version && sceneId ? { developerId: project.data.developerId, sceneId, hash: version.hash } : null),
    [project.data, version, sceneId],
  );
  const view: StageView = sceneRef
    ? { id: 'inspect', content: 'inspect', scene: sceneRef, control: 'free', dim: 1 }
    : { id: 'inspect', content: 'trace', pose: { position: [0, 9, 30], target: [0, -1, 0], fov: 50 }, drift: true, dim: 0.5 };
  useStageView(view);
  useStageRegion(region);

  // Keyboard: A frames everything, F frames the selection, Esc clears it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey) return;
      const ui = useInspector.getState();
      if (e.altKey && /^[1-6]$/.test(e.key)) {
        e.preventDefault();
        panelActions(SCOPE).open(PANEL_ORDER[Number(e.key) - 1]);
      } else if (e.altKey) return;
      else if (e.key === 'a' || e.key === 'A') ui.frameAll();
      else if (e.key === 'f' || e.key === 'F') ui.frameSelected();
      else if (e.key === 'Escape') ui.select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const base = `/projects/${projectId}/scenes/${encodeURIComponent(sceneId ?? '')}`;
  const title = scene.data ? sceneTitle(scene.data) : 'Scene';
  useWindowTitle(`Inspect · ${title}`);
  const crumbs = [
    { label: 'Projects', to: '/projects' },
    { label: project.data?.name ?? 'Project', to: `/projects/${projectId}` },
    { label: title, to: base },
    { label: version ? `Inspect v${version.version}` : 'Inspect' },
  ];

  const panels: PanelDef[] = useMemo(
    () => [
      { id: 'hierarchy', title: 'Hierarchy', icon: ListTree, shortcut: 'Alt+1', render: () => <HierarchyPanel /> },
      { id: 'materials', title: 'Materials', icon: Palette, shortcut: 'Alt+2', render: () => <MaterialsPanel /> },
      { id: 'textures', title: 'Textures', icon: Image, shortcut: 'Alt+3', render: () => <TexturesPanel /> },
      { id: 'geometries', title: 'Geometries', short: 'Geometry', icon: Boxes, shortcut: 'Alt+4', render: () => <GeometriesPanel /> },
      { id: 'stats', title: 'Stats', icon: Activity, shortcut: 'Alt+5', render: () => <StatsPanel version={version} /> },
      { id: 'raw', title: 'Raw data', short: 'Raw', icon: Braces, shortcut: 'Alt+6', render: () => <RawPanel /> },
    ],
    [version],
  );

  const error = project.error ?? scene.error;
  const chromeTrailing = version ? (
    <div className="pointer-events-auto flex min-w-0 items-center gap-2.5">
      <VersionChip version={version.version} current={version.isCurrent} />
      <span className="tabular hidden font-mono text-[12px] text-fg-3 sm:inline">{formatBytes(version.sizeBytes)}</span>
      <Menu
        trigger={
          <IconButton label="Inspector actions" size="sm" tooltip={false}>
            <MoreHorizontal className="h-4 w-4" />
          </IconButton>
        }
        items={[{ label: 'Reset panel layout', icon: Grid3x3, onSelect: () => panelActions(SCOPE).reset() }]}
      />
    </div>
  ) : undefined;

  return (
    <div className="flex h-full flex-col">
      <Chrome crumbs={crumbs} variant="line" trailing={chromeTrailing} />
      <main id="main" className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div ref={region} className="relative min-h-0 min-w-0 flex-1">
          <StageSurface className="absolute inset-0 z-0" />
          <StageNotice />
          <PanelRail scope={SCOPE} panels={panels} />
          <DockReveal scope={SCOPE} panels={panels} />
          <FloatingPanels scope={SCOPE} panels={panels} />

          {error ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6 [&>*]:pointer-events-auto">
              <ErrorState error={error} title="The scene did not load" className="max-w-lg" onRetry={() => window.location.reload()} />
            </div>
          ) : sceneState.status === 'error' && sceneRef ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6 [&>*]:pointer-events-auto">
              <ErrorState error={sceneState.error} title="The scene did not load" onRetry={() => useStage.getState().retryScene()} className="max-w-lg" />
            </div>
          ) : null}

          {ready && (
            <>
              <div className="glass elevated pointer-events-auto absolute bottom-3 right-3 z-10 flex items-center gap-0.5 rounded-[var(--radius-card)] border border-rule p-1">
                <IconButton label="Frame the whole scene" shortcut="A" size="sm" onClick={() => useInspector.getState().frameAll()}>
                  <Maximize className="h-4 w-4" />
                </IconButton>
                <IconButton label="Frame selection" shortcut="F" size="sm" disabled={!selected} onClick={() => useInspector.getState().frameSelected()}>
                  <LocateFixed className="h-4 w-4" />
                </IconButton>
                <IconButton label={showGrid ? 'Hide grid' : 'Show grid'} size="sm" active={showGrid} onClick={() => useInspector.getState().toggleGrid()}>
                  <Grid3x3 className="h-4 w-4" />
                </IconButton>
              </div>
              {selected && (
                <div className="glass elevated pointer-events-auto absolute bottom-3 left-3 z-10 flex max-w-[min(520px,70%)] animate-rise items-center gap-2 rounded-[var(--radius-card)] border border-rule py-1 pl-3 pr-1">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-now shadow-[0_0_8px_rgb(255_181_71/0.8)]" />
                  <button type="button" className="min-w-0 text-left" onClick={() => panelActions(SCOPE).open('hierarchy')}>
                    <span className="block truncate text-[13px] font-medium text-fg">{selected.name || `(${nodeType(selected)})`}</span>
                    <span className="tabular block truncate font-mono text-[11px] text-fg-3">{nodeType(selected)}</span>
                  </button>
                  <IconButton label="Clear selection" shortcut="Esc" size="sm" onClick={() => useInspector.getState().select(null)}>
                    <X className="h-4 w-4" />
                  </IconButton>
                </div>
              )}
            </>
          )}
        </div>
        <PanelDock scope={SCOPE} panels={panels} bounds={() => ({ w: region.current?.clientWidth ?? 800, h: region.current?.clientHeight ?? 500 })} />
      </main>
    </div>
  );
}

const PANEL_ORDER = ['hierarchy', 'materials', 'textures', 'geometries', 'stats', 'raw'];
