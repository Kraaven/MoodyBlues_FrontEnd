import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Box, Info } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { CopyableId } from '../components/CopyableId';
import { SceneCard } from '../components/SceneCard';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { FieldError } from '../components/ui/Input';
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
    <div className="min-h-screen bg-canvas">
      <Navbar />

      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link
          to="/dashboard"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-muted transition hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>

        {error && <FieldError>{error}</FieldError>}

        {project && (
          <>
            <PageHeader eyebrow="Project" title={project.name} />

            <div className="mb-8 flex flex-wrap items-center gap-3 rounded-2xl border border-block-lilac/25 bg-block-lilac/[0.06] px-4 py-3.5">
              <Info className="h-4 w-4 shrink-0 text-block-lilac" />
              <p className="flex-1 text-sm text-ink-muted">
                Paste this Developer ID into your Unity client&apos;s config so it uploads scenes here.
              </p>
              <CopyableId value={project.developerId} label="Developer ID" />
            </div>

            <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
              Scenes ({project.scenes.length})
            </h2>

            {project.scenes.length === 0 ? (
              <EmptyState
                icon={Box}
                title="No scenes uploaded yet"
                description="Once your Unity client handshakes with this Developer ID, uploaded scenes will show up here."
              />
            ) : (
              <div className="space-y-2">
                {project.scenes.map((scene) => (
                  <SceneCard key={scene.sceneId} projectId={project.id} scene={scene} onRename={onRename} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
