import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ViewerCanvas } from '../viewer/ViewerCanvas';
import { ViewerSidebar } from '../viewer/ViewerSidebar';
import { useViewerStore } from '../viewer/viewerStore';
import { api, ApiError } from '../lib/api';
import type { ProjectDetail } from '../lib/types';

export function ViewerPage() {
  const { projectId, sceneId } = useParams<{ projectId: string; sceneId: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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

  return (
    <div className="flex h-screen flex-col bg-[#0b0b0f]">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Link
            to={`/projects/${projectId}`}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="h-5 w-px bg-white/10" />
          <div>
            <p className="text-sm font-medium text-white">{title}</p>
            {scene?.displayName && <p className="text-xs text-zinc-500">Original: {sceneId}</p>}
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading model...
          </div>
        )}
      </header>

      {loadError && <p className="px-4 py-2 text-sm text-red-400">{loadError}</p>}
      {viewerError && <p className="px-4 py-2 text-sm text-red-400">{viewerError}</p>}

      <div className="relative flex flex-1 overflow-hidden">
        <div className="relative flex-1">
          {project && <ViewerCanvas developerId={project.developerId} sceneId={sceneId} />}
        </div>
        <ViewerSidebar />
      </div>
    </div>
  );
}
