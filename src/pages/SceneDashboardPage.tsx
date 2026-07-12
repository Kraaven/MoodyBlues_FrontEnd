import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, Eye, HardDrive, PlayCircle, Settings, Sparkles } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { CopyableId } from '../components/CopyableId';
import { Modal } from '../components/Modal';
import { SceneStatusChip } from '../components/StatusChip';
import { Button, IconButton, LinkButton } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { EmptyState } from '../components/ui/EmptyState';
import { Input, Label, FieldError } from '../components/ui/Input';
import { api, ApiError } from '../lib/api';
import { formatBytes, formatDate } from '../lib/format';
import type { ProjectDetail, ProjectScene } from '../lib/types';

export function SceneDashboardPage() {
  const { projectId, sceneId } = useParams<{ projectId: string; sceneId: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const loadProject = () => {
    if (!projectId) return;
    api
      .get<ProjectDetail>(`/api/projects/${projectId}`)
      .then(setProject)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load project.'));
  };

  useEffect(() => {
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (!projectId || !sceneId) {
    return null;
  }

  const scene = project?.scenes.find((s) => s.sceneId === sceneId);

  return (
    <div className="min-h-screen bg-canvas">
      <Navbar />

      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link
          to={`/projects/${projectId}`}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-ink-muted transition hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
          {project ? project.name : 'Back to project'}
        </Link>

        {error && <FieldError>{error}</FieldError>}

        {!project && !error && <div className="h-56 animate-pulse rounded-2xl border border-hairline bg-surface" />}

        {project && !scene && (
          <EmptyState icon={Sparkles} title="Scene not found" description="This scene may have been removed." />
        )}

        {project && scene && (
          <>
            <SceneHeroHeader
              projectId={projectId}
              sceneId={sceneId}
              scene={scene}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />

            <SessionsSection />
          </>
        )}
      </main>

      {project && scene && isSettingsOpen && (
        <SceneSettingsModal
          developerId={project.developerId}
          scene={scene}
          onClose={() => setIsSettingsOpen(false)}
          onSaved={() => {
            setIsSettingsOpen(false);
            loadProject();
          }}
        />
      )}
    </div>
  );
}

function SceneHeroHeader({
  projectId,
  sceneId,
  scene,
  onOpenSettings,
}: {
  projectId: string;
  sceneId: string;
  scene: ProjectScene;
  onOpenSettings: () => void;
}) {
  return (
    <div className="mb-8 rounded-2xl border border-white/10 bg-block-navy p-7">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white/50">Scene</p>
          <h1 className="truncate text-[28px] font-medium leading-tight tracking-[-0.01em] text-white">
            {scene.displayName ?? scene.sceneId}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <SceneStatusChip status={scene.processingStatus} />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70">
              <HardDrive className="h-3 w-3" />
              {formatBytes(scene.sizeBytes)}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70">
              <Clock className="h-3 w-3" />
              Uploaded {formatDate(scene.updatedAtUtc)}
            </span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-white/40">Original ID</span>
            <CopyableId value={scene.sceneId} label="Copy Scene ID" tone="inverse" />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <IconButton
            variant="inverse"
            size="lg"
            title="Scene settings"
            aria-label="Scene settings"
            onClick={onOpenSettings}
          >
            <Settings className="h-4 w-4" />
          </IconButton>
          <LinkButton to={`/projects/${projectId}/scenes/${encodeURIComponent(sceneId)}/view`} size="md">
            <Eye className="h-4 w-4" />
            View model
          </LinkButton>
        </div>
      </div>
    </div>
  );
}

function SessionsSection() {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">Session recordings</h2>
        <Chip tone="lilac">Coming soon</Chip>
      </div>

      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
        <div className="grid grid-cols-[2.5rem_1fr_1fr_6rem_5rem] gap-3 border-b border-hairline px-4 py-2.5 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
          <span>#</span>
          <span>Session ID</span>
          <span>Date</span>
          <span>Duration</span>
          <span className="text-right">View</span>
        </div>

        <EmptyState
          icon={PlayCircle}
          title="No session recordings yet"
          description="Playback of recorded play sessions will show up here once this feature ships."
          className="rounded-none border-0"
        />
      </div>
    </div>
  );
}

function SceneSettingsModal({
  developerId,
  scene,
  onClose,
  onSaved,
}: {
  developerId: string;
  scene: ProjectScene;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(scene.displayName ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.patch(`/api/scenes/${developerId}/${encodeURIComponent(scene.sceneId)}`, { displayName: name });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update scene.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title="Scene settings" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="scene-name">Display name</Label>
          <Input
            id="scene-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={scene.sceneId}
          />
          <p className="mt-1.5 text-[11px] text-ink-faint">
            Dashboard-only -- the original scene ID Unity uses is never changed.
          </p>
        </div>

        <div className="rounded-xl border border-hairline bg-surface-soft px-3.5 py-3">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint">Original scene ID</p>
          <p className="truncate font-mono text-xs text-ink-muted">{scene.sceneId}</p>
        </div>

        {error && <FieldError>{error}</FieldError>}

        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="flex-1">
            {isSubmitting ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
