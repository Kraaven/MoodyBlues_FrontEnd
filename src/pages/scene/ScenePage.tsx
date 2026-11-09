import { lazy, Suspense, useState } from 'react';
import { Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { AlertTriangle, Download, Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { sceneFilePath, saveDownload, useDeleteScene, useProject, useRenameScene, useScene, useSessions } from '../../api/queries';
import { errorText } from '../../api/client';
import type { ProjectDetail, SceneDetail, SessionSummary } from '../../api/types';
import { AppShell } from '../../shell/AppShell';
import { Button, IconButton, LinkButton } from '../../ui/Button';
import { VersionChip, VersionStatusChip } from '../../ui/Chip';
import { ConfirmDialog } from '../../ui/Dialog';
import { Input } from '../../ui/Field';
import { Menu } from '../../ui/Menu';
import { SceneCover } from '../../ui/SceneCover';
import { ErrorState, Skeleton } from '../../ui/States';
import { RouteTabs } from '../../ui/Tabs';
import { useToast } from '../../ui/Toast';
import { formatBytes, formatCount, formatRecorded, plural, safeFilename, sceneTitle } from '../../lib/format';

const ScenePreview = lazy(() => import('../../viewer/ScenePreview'));

/** Scenes above this size show their cover until the user asks for the 3D preview (DESIGN.md 7.5). */
const AUTO_PREVIEW_MAX_BYTES = 25 * 1024 * 1024;

export interface SceneContext {
  project: ProjectDetail;
  scene: SceneDetail;
  base: string;
}

// oxlint-disable-next-line react/only-export-components -- route context accessor, used by the tab pages
export function useSceneContext(): SceneContext {
  return useOutletContext<SceneContext>();
}

export function ScenePage() {
  const { projectId, sceneId } = useParams<{ projectId: string; sceneId: string }>();
  const project = useProject(projectId);
  const scene = useScene(project.data?.developerId, sceneId);

  const base = `/projects/${projectId}/scenes/${encodeURIComponent(sceneId ?? '')}`;
  const title = scene.data ? sceneTitle(scene.data) : 'Scene';
  const crumbs = [
    { label: 'Projects', to: '/projects' },
    { label: project.data?.name ?? 'Project', to: `/projects/${projectId}` },
    { label: title },
  ];

  const error = project.error ?? scene.error;
  return (
    <AppShell crumbs={crumbs}>
      {error ? (
        <ErrorState error={error} title="This scene did not load" onRetry={() => (project.isError ? project.refetch() : scene.refetch())} />
      ) : !project.data || !scene.data ? (
        <div className="space-y-6">
          <Skeleton className="h-[220px] rounded-[var(--radius-card)]" />
          <Skeleton className="h-10 w-80" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <>
          <SceneHeader project={project.data} scene={scene.data} base={base} />
          <SceneWarnings scene={scene.data} />
          <div className="mt-8">
            <RouteTabs
              items={[
                { to: base, label: 'Sessions', end: true, count: scene.data.current?.sessionCount },
                { to: `${base}/archive`, label: 'Archive', count: scene.data.archived.length },
                { to: `${base}/settings`, label: 'Settings' },
              ]}
            />
          </div>
          <div className="pt-6">
            <Outlet context={{ project: project.data, scene: scene.data, base } satisfies SceneContext} />
          </div>
        </>
      )}
    </AppShell>
  );
}

function SceneHeader({ project, scene, base }: { project: ProjectDetail; scene: SceneDetail; base: string }) {
  const current = scene.current;
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewWanted, setPreviewWanted] = useState(false);
  const notify = useToast();

  const showPreview = current !== null && (current.sizeBytes <= AUTO_PREVIEW_MAX_BYTES || previewWanted);

  const download = async () => {
    try {
      await saveDownload(sceneFilePath(project.developerId, scene.sceneId), safeFilename(`${sceneTitle(scene)}-v${current?.version ?? 0}`, '.glb'));
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  return (
    <section className="grid overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="flex min-w-0 flex-col justify-between gap-6 p-6">
        <div className="min-w-0 space-y-3">
          {renaming ? (
            <RenameField project={project} scene={scene} onDone={() => setRenaming(false)} />
          ) : (
            <button type="button" onClick={() => setRenaming(true)} className="group flex min-w-0 max-w-full items-center gap-2 text-left" aria-label="Rename scene">
              <h1 className="truncate font-display text-[34px] leading-[40px] text-fg">{sceneTitle(scene)}</h1>
              <Pencil className="h-4 w-4 shrink-0 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {current ? <VersionChip version={current.version} current /> : null}
            {current && current.processingStatus !== 'Ready' && <VersionStatusChip status={current.processingStatus} />}
          </div>
          {current && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 pt-1 text-[13px]">
              <Fact label="Uploaded" value={formatRecorded(current.uploadedAtUtc)} />
              <Fact label="Size" value={formatBytes(current.sizeBytes)} />
              <Fact label="Tracked objects" value={formatCount(current.trackedObjectCount)} />
              <Fact label="Sessions" value={formatCount(current.sessionCount)} />
            </dl>
          )}
        </div>
        <div className="flex items-center gap-2">
          <LinkButton to={`${base}/inspect`} variant="secondary" size="sm">
            <Eye className="h-4 w-4" />
            Inspect
          </LinkButton>
          <Menu
            align="start"
            trigger={
              <IconButton label="More scene actions" size="sm" tooltip={false}>
                <MoreHorizontal className="h-4 w-4" />
              </IconButton>
            }
            items={[
              { label: 'Download .glb', icon: Download, onSelect: () => void download(), disabled: !current },
              { label: 'Rename', icon: Pencil, onSelect: () => setRenaming(true) },
              { label: 'Delete scene', icon: Trash2, danger: true, separated: true, onSelect: () => setDeleting(true) },
            ]}
          />
        </div>
      </div>

      <div className="relative min-h-[240px] border-t border-line lg:border-l lg:border-t-0">
        <SceneCover seed={scene.sceneId} className="absolute inset-0 rounded-none border-0" />
        {showPreview && current ? (
          <Suspense fallback={null}>
            <ScenePreview developerId={project.developerId} sceneId={scene.sceneId} hash={current.hash} />
          </Suspense>
        ) : current ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button variant="secondary" size="sm" onClick={() => setPreviewWanted(true)}>
              Load 3D preview ({formatBytes(current.sizeBytes)})
            </Button>
          </div>
        ) : null}
      </div>

      <DeleteSceneDialog open={deleting} onOpenChange={setDeleting} project={project} scene={scene} />
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-fg-3">{label}</dt>
      <dd className="tabular truncate text-fg">{value}</dd>
    </div>
  );
}

function RenameField({ project, scene, onDone }: { project: ProjectDetail; scene: SceneDetail; onDone: () => void }) {
  const [value, setValue] = useState(scene.displayName ?? '');
  const rename = useRenameScene(project.developerId, scene.sceneId);
  const notify = useToast();

  const save = async () => {
    try {
      await rename.mutateAsync(value.trim());
      onDone();
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Input
        autoFocus
        value={value}
        maxLength={200}
        placeholder={scene.sceneId}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onDone()}
        aria-label="Scene display name"
        className="text-[16px]"
      />
      <Button type="submit" size="sm" loading={rename.isPending}>
        Save
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </form>
  );
}

function SceneWarnings({ scene }: { scene: SceneDetail }) {
  const current = scene.current;
  if (!current) return null;
  const warnings: string[] = [];
  if (current.processingStatus === 'Failed') {
    warnings.push(`This version could not be optimized${current.errorMessage ? ` (${current.errorMessage})` : ''}. Replays use the unoptimized upload.`);
  }
  if (current.skippedMeshCount > 0) {
    warnings.push(
      `${plural(current.skippedMeshCount, 'mesh', 'meshes')} could not be included in this export and will be missing from replays. ` +
        'They need Read/Write in Unity: run MoodyBlues > Make Scene Meshes Readable, or export from the Editor with MoodyBlues > Export This Scene.',
    );
  }
  if (warnings.length === 0) return null;
  return (
    <div className="mt-4 space-y-2">
      {warnings.map((w) => (
        <div key={w} className="flex items-start gap-3 rounded-[var(--radius-card)] border border-warn/25 bg-warn/[0.06] px-4 py-3 text-[13px] text-fg-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <p>{w}</p>
        </div>
      ))}
    </div>
  );
}

export function DeleteSceneDialog({
  open,
  onOpenChange,
  project,
  scene,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDetail;
  scene: SceneDetail;
}) {
  const remove = useDeleteScene(project.developerId, scene.sceneId);
  const navigate = useNavigate();
  const notify = useToast();
  const current = useSessions(project.developerId, scene.sceneId, open && scene.current ? { version: scene.current.version } : null);
  const live = (current.data ?? []).filter((s: SessionSummary) => s.status === 'Recording').length;

  const versions = (scene.current ? 1 : 0) + scene.archived.length;
  const sessions = (scene.current?.sessionCount ?? 0) + scene.archived.reduce((n, v) => n + v.sessionCount, 0) + scene.awaitingSceneSessionCount;
  const name = sceneTitle(scene);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${name}?`}
      confirmLabel="Delete scene"
      typeToConfirm={name}
      body={
        <>
          <p>
            This deletes {plural(versions, 'version')}, {plural(sessions, 'session')} and{' '}
            <span className="text-fg">{formatBytes(scene.totalBytes)}</span> of files. It cannot be undone.
          </p>
          {live > 0 && <p className="text-warn">{plural(live, 'session is', 'sessions are')} recording right now. They will be stopped.</p>}
          <p>The next upload of this scene from Unity starts again at v1.</p>
        </>
      }
      onConfirm={async () => {
        const result = await remove.mutateAsync();
        notify(`Deleted ${plural(result.deletedVersions, 'version')} and ${plural(result.deletedSessions, 'session')}, freed ${formatBytes(result.freedBytes)}.`);
        navigate(`/projects/${project.id}`);
      }}
    />
  );
}
