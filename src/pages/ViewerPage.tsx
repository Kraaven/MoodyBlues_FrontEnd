import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import { ViewerCanvas } from '../viewer/ViewerCanvas';
import { ViewerSidebar } from '../viewer/ViewerSidebar';
import { useViewerStore } from '../viewer/viewerStore';
import { IconButton } from '../components/ui/Button';
import { api, ApiError, downloadSceneFile } from '../lib/api';
import type { ProjectDetail } from '../lib/types';

export function ViewerPage() {
  const { projectId, sceneId } = useParams<{ projectId: string; sceneId: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const isLoading = useViewerStore((s) => s.isLoading);
  const viewerError = useViewerStore((s) => s.error);

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
      <header className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link
            to={`/projects/${projectId}/scenes/${encodeURIComponent(sceneId)}`}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-ink-muted transition hover:bg-white/5 hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="h-5 w-px bg-hairline" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">Model viewer</p>
            <p className="text-sm font-medium text-ink">{title}</p>
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

      <div className="relative flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          {project && <ViewerCanvas developerId={project.developerId} sceneId={sceneId} />}
        </div>
        <ViewerSidebar />
      </div>
    </div>
  );
}
