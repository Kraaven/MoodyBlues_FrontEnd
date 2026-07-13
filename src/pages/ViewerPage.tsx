import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, X } from 'lucide-react';
import { ViewerCanvas } from '../viewer/ViewerCanvas';
import { ViewerDock } from '../viewer/ViewerDock';
import { HierarchyPanel } from '../viewer/panels/HierarchyPanel';
import { InspectorPanel } from '../viewer/panels/InspectorPanel';
import { MaterialsPanel } from '../viewer/panels/MaterialsPanel';
import { SceneStatsPanel } from '../viewer/panels/SceneStatsPanel';
import { useViewerStore } from '../viewer/viewerStore';
import { usePanelResize } from '../viewer/usePanelResize';
import { IconButton } from '../components/ui/Button';
import { api, ApiError, downloadSceneFile } from '../lib/api';
import type { ProjectDetail } from '../lib/types';
import type { RightPanelTab } from '../viewer/viewerStore';

const RIGHT_PANEL_LABELS: Record<RightPanelTab, string> = {
  inspector: 'Inspector',
  materials: 'Materials',
  stats: 'Scene Stats',
};

function ResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="group relative w-1 shrink-0 cursor-col-resize bg-hairline transition hover:bg-accent/60"
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  );
}

export function ViewerPage() {
  const { projectId, sceneId } = useParams<{ projectId: string; sceneId: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const isLoading = useViewerStore((s) => s.isLoading);
  const viewerError = useViewerStore((s) => s.error);
  const gltf = useViewerStore((s) => s.gltf);
  const leftPanelOpen = useViewerStore((s) => s.leftPanelOpen);
  const rightPanelTab = useViewerStore((s) => s.rightPanelTab);
  const setRightPanelTab = useViewerStore((s) => s.setRightPanelTab);

  const leftResize = usePanelResize('left', 220, 420, 280);
  const rightResize = usePanelResize('right', 260, 480, 320);

  useEffect(() => {
    if (!projectId) return;
    api
      .get<ProjectDetail>(`/api/projects/${projectId}`)
      .then(setProject)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : 'Failed to load project.'));
  }, [projectId]);

  useEffect(() => () => useViewerStore.getState().reset(), []);

  if (!projectId || !sceneId) {
    return null;
  }

  const scene = project?.scenes.find((s) => s.sceneId === sceneId);
  const title = scene?.displayName ?? sceneId;

  const onDownload = async () => {
    if (!project) return;
    setDownloadError(null);
    setIsDownloading(true);
    try {
      await downloadSceneFile(project.developerId, sceneId, title);
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : 'Failed to download scene file.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-hairline px-4">
        <div className="flex items-center gap-3">
          <Link
            to={`/projects/${projectId}/scenes/${encodeURIComponent(sceneId)}`}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm text-ink-muted transition hover:bg-white/5 hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="h-5 w-px bg-hairline" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">Model viewer</p>
            <p className="text-sm font-medium leading-tight text-ink">{title}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isLoading && (
            <div className="flex items-center gap-2 font-mono text-xs text-ink-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading model...
            </div>
          )}
          <IconButton
            title="Download .glb"
            aria-label="Download .glb"
            disabled={!project || isDownloading}
            onClick={onDownload}
          >
            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </IconButton>
        </div>
      </header>

      {loadError && <p className="px-4 py-2 text-sm text-danger">{loadError}</p>}
      {viewerError && <p className="px-4 py-2 text-sm text-danger">{viewerError}</p>}
      {downloadError && <p className="px-4 py-2 text-sm text-danger">{downloadError}</p>}

      <div className="flex flex-1 overflow-hidden">
        <ViewerDock side="left" />

        {gltf && leftPanelOpen && (
          <>
            <div
              className="flex shrink-0 flex-col border-r border-hairline bg-canvas-raised"
              style={{ width: leftResize.width }}
            >
              <div className="flex h-8 shrink-0 items-center justify-between border-b border-hairline px-3">
                <span className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">Hierarchy</span>
                <button
                  type="button"
                  onClick={useViewerStore.getState().toggleLeftPanel}
                  className="rounded p-0.5 text-ink-faint transition hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <HierarchyPanel />
              </div>
            </div>
            <ResizeHandle onMouseDown={leftResize.onMouseDown} />
          </>
        )}

        {project && <ViewerCanvas developerId={project.developerId} sceneId={sceneId} />}

        {gltf && rightPanelTab && (
          <>
            <ResizeHandle onMouseDown={rightResize.onMouseDown} />
            <div
              className="flex shrink-0 flex-col border-l border-hairline bg-canvas-raised"
              style={{ width: rightResize.width }}
            >
              <div className="flex h-8 shrink-0 items-center justify-between border-b border-hairline px-3">
                <span className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
                  {RIGHT_PANEL_LABELS[rightPanelTab]}
                </span>
                <button
                  type="button"
                  onClick={() => setRightPanelTab(null)}
                  className="rounded p-0.5 text-ink-faint transition hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {rightPanelTab === 'inspector' && <InspectorPanel />}
                {rightPanelTab === 'materials' && <MaterialsPanel />}
                {rightPanelTab === 'stats' && <SceneStatsPanel />}
              </div>
            </div>
          </>
        )}

        <ViewerDock side="right" />
      </div>
    </div>
  );
}
