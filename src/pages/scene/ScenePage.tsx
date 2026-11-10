import { useCallback, useState } from 'react';
import { Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { AlertTriangle, Download, Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { sceneFilePath, saveDownload, useDeleteScene, useProject, useRenameScene, useScene, useSessions } from '../../api/queries';
import { errorText } from '../../api/client';
import type { ProjectDetail, SceneDetail, SessionSummary } from '../../api/types';
import { Chrome } from '../../stage/Chrome';
import { RecIndicator } from '../../stage/RecIndicator';
import { StageSurface } from '../../stage/StageSurface';
import { useStage, type StageView } from '../../stage/store';
import { useStageInset } from '../../stage/useStageInset';
import { useStageView } from '../../stage/useStageView';
import { Button, IconButton, LinkButton } from '../../ui/Button';
import { VersionChip, VersionStatusChip } from '../../ui/Chip';
import { ConfirmDialog } from '../../ui/Dialog';
import { Input } from '../../ui/Field';
import { Menu } from '../../ui/Menu';
import { SnapshotImage } from '../../ui/SnapshotImage';
import { ErrorState, Skeleton } from '../../ui/States';
import { RouteTabs } from '../../ui/Tabs';
import { useToast } from '../../ui/Toast';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { useWindowTitle } from '../../lib/useWindowTitle';
import { formatBytes, formatCount, formatRecorded, plural, safeFilename, sceneTitle } from '../../lib/format';

/** Scenes above this size wait for a click before the Stage downloads them (DESIGN.md 4.5). */
const AUTO_LOAD_MAX_BYTES = 25 * 1024 * 1024;
/** The text column's share of the window on a desktop, in pixels; the 3D centres in what is left. */
const COLUMN_WIDTH = 760;

export interface SceneContext {
  project: ProjectDetail;
  scene: SceneDetail;
  base: string;
}

// oxlint-disable-next-line react/only-export-components -- route context accessor, used by the tab pages
export function useSceneContext(): SceneContext {
  return useOutletContext<SceneContext>();
}

const TRACE_BACKDROP: StageView = {
  id: 'scene',
  content: 'trace',
  pose: { position: [0, 9, 30], target: [0, -1, 0], fov: 50 },
  drift: true,
  dim: 0.35,
};

const insetForColumn = (width: number) => ({ left: width >= 1024 ? COLUMN_WIDTH : 0, right: 0, top: 0, bottom: 0 });

export function ScenePage() {
  const { projectId, sceneId } = useParams<{ projectId: string; sceneId: string }>();
  const project = useProject(projectId);
  const scene = useScene(project.data?.developerId, sceneId);
  const [loadLarge, setLoadLarge] = useState(false);
  const phone = useMediaQuery('(max-width: 639px)');
  const desktop = useMediaQuery('(min-width: 1024px)');

  const current = scene.data?.current ?? null;
  const developerId = project.data?.developerId;
  const tooBig = current !== null && current.sizeBytes > AUTO_LOAD_MAX_BYTES && !loadLarge;
  const live = !phone && current !== null && developerId !== undefined && !tooBig;

  // The Stage shows the scene itself, large and live, behind the page (DESIGN.md 7.5). Without a
  // version, on a phone, or for a very large file nobody asked for, it shows something lighter.
  let view: StageView = TRACE_BACKDROP;
  if (phone) view = { id: 'scene', content: 'none', dim: 0 };
  else if (live) {
    view = {
      id: 'scene',
      content: 'scene',
      scene: { developerId, sceneId: scene.data!.sceneId, hash: current!.hash },
      control: 'free',
      idleOrbit: true,
      dim: 1,
      durationMs: 700,
    };
  }
  useStageView(view);
  useStageInset(insetForColumn);

  const sessions = useSessions(developerId, scene.data?.sceneId, current ? { version: current.version } : null);
  const recording = (sessions.data ?? []).filter((s: SessionSummary) => s.status === 'Recording');

  const base = `/projects/${projectId}/scenes/${encodeURIComponent(sceneId ?? '')}`;
  const title = scene.data ? sceneTitle(scene.data) : 'Scene';
  useWindowTitle(title);
  const crumbs = [
    { label: 'Projects', to: '/projects' },
    { label: project.data?.name ?? 'Project', to: `/projects/${projectId}` },
    { label: title },
  ];
  const trailing =
    recording.length > 0 ? (
      <RecIndicator count={recording.length} to={recording.length === 1 ? `${base}/sessions/${encodeURIComponent(recording[0].id)}` : base} />
    ) : undefined;

  const error = project.error ?? scene.error;
  return (
    <div className="relative min-h-full">
      <Chrome crumbs={crumbs} trailing={trailing} />
      {live && <StageSurface />}
      {/* Keeps the text column legible over the 3D. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-y-0 left-0 z-[1] w-[min(980px,96vw)] bg-gradient-to-r from-ink-0/90 via-ink-0/60 to-transparent" />

      <main id="main" className="pointer-events-none relative z-[2] px-4 pb-20 pt-24 sm:px-8 lg:px-12">
        <div className="pointer-events-auto w-full animate-rise lg:w-[700px]">
          {error ? (
            <ErrorState error={error} title="This scene did not load" onRetry={() => (project.isError ? project.refetch() : scene.refetch())} />
          ) : !project.data || !scene.data ? (
            <div className="space-y-6">
              <Skeleton className="h-12 w-80" />
              <Skeleton className="h-24" />
              <Skeleton className="h-10 w-80" />
              <Skeleton className="h-48" />
            </div>
          ) : (
            <>
              {phone && <SnapshotImage hash={current?.hash} seed={scene.data.sceneId} className="mb-5 aspect-video w-full" />}
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
        </div>
      </main>

      {/* What the Stage is doing, in the part of the window the column leaves free. */}
      {desktop && current && <StageNotice tooBig={tooBig} size={current.sizeBytes} hash={current.hash} seed={scene.data?.sceneId ?? ''} onLoad={() => setLoadLarge(true)} />}
    </div>
  );
}

/** A very large scene waits for a click; a scene that fails to load says why, with Retry. */
function StageNotice({ tooBig, size, hash, seed, onLoad }: { tooBig: boolean; size: number; hash: string; seed: string; onLoad: () => void }) {
  const state = useStage((s) => s.scene);
  const view = useStage((s) => s.view);
  const showError = view.content === 'scene' && state.status === 'error';
  if (!tooBig && !showError) return null;

  return (
    <div className="pointer-events-auto fixed right-8 top-1/2 z-[3] w-[min(360px,calc(100vw-800px))] -translate-y-1/2 space-y-4">
      {tooBig ? (
        <>
          <SnapshotImage hash={hash} seed={seed} className="aspect-video w-full" />
          <Button variant="secondary" className="w-full" onClick={onLoad}>
            Load the 3D scene ({formatBytes(size)})
          </Button>
        </>
      ) : (
        <ErrorState error={state.error} title="The scene did not load" onRetry={() => useStage.getState().retryScene()} />
      )}
    </div>
  );
}

function SceneHeader({ project, scene, base }: { project: ProjectDetail; scene: SceneDetail; base: string }) {
  const current = scene.current;
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const notify = useToast();

  const download = useCallback(async () => {
    try {
      await saveDownload(sceneFilePath(project.developerId, scene.sceneId), safeFilename(`${sceneTitle(scene)}-v${current?.version ?? 0}`, '.glb'));
    } catch (err) {
      notify(errorText(err), 'error');
    }
  }, [project.developerId, scene, current?.version, notify]);

  return (
    <header className="space-y-4">
      {renaming ? (
        <RenameField project={project} scene={scene} onDone={() => setRenaming(false)} />
      ) : (
        <button type="button" onClick={() => setRenaming(true)} className="group flex min-w-0 max-w-full items-center gap-2 text-left" aria-label="Rename scene">
          <h1 className="truncate font-display text-[44px] leading-[52px] text-fg">{sceneTitle(scene)}</h1>
          <Pencil className="h-4 w-4 shrink-0 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        </button>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {current ? <VersionChip version={current.version} current /> : null}
        {current && current.processingStatus !== 'Ready' && <VersionStatusChip status={current.processingStatus} />}
      </div>
      {current && (
        <dl className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
          <Fact label="Uploaded" value={formatRecorded(current.uploadedAtUtc)} />
          <Fact label="Size" value={formatBytes(current.sizeBytes)} />
          <Fact label="Tracked objects" value={formatCount(current.trackedObjectCount)} />
          <Fact label="Sessions" value={formatCount(current.sessionCount)} />
        </dl>
      )}
      <div className="flex items-center gap-2 pt-1">
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
      <DeleteSceneDialog open={deleting} onOpenChange={setDeleting} project={project} scene={scene} />
    </header>
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
    <div className="mt-5 space-y-2">
      {warnings.map((w) => (
        <div key={w} className="flex items-start gap-3 rounded-[var(--radius-card)] border border-caution/25 bg-ink-1/80 px-4 py-3 text-[13px] text-fg-2 backdrop-blur-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-caution" />
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
          {live > 0 && <p className="text-caution">{plural(live, 'session is', 'sessions are')} recording right now. They will be stopped.</p>}
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
