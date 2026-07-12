import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Box } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { CopyableId } from '../components/CopyableId';
import { SceneRow } from '../components/SceneRow';
import { api, ApiError } from '../lib/api';
import type { ProjectDetail } from '../lib/types';

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProject = () => {
    if (!projectId) return;
    api
      .get<ProjectDetail>(`/api/projects/${projectId}`)
      .then(setProject)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load project.'));
  };

  useEffect(() => {
    loadProject();
    const interval = setInterval(loadProject, 10_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const onRename = async (sceneId: string, displayName: string) => {
    if (!project) return;
    await api.patch(`/api/scenes/${project.developerId}/${encodeURIComponent(sceneId)}`, { displayName });
    loadProject();
  };

  return (
    <div className="min-h-screen bg-[#0b0b0f]">
      <Navbar />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link to="/dashboard" className="mb-6 flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {project && (
          <>
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-white">{project.name}</h1>
                <p className="mt-1 text-sm text-zinc-400">
                  Paste this Developer ID into your Unity client's config so it uploads scenes here.
                </p>
              </div>
              <CopyableId value={project.developerId} label="Developer ID" />
            </div>

            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">Scenes</h2>

            {project.scenes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
                <Box className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
                <p className="text-zinc-400">
                  No scenes uploaded yet. Once your Unity client handshakes with this Developer ID, uploaded scenes
                  will show up here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {project.scenes.map((scene) => (
                  <SceneRow key={scene.sceneId} projectId={project.id} scene={scene} onRename={onRename} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
