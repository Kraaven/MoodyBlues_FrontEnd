import { useState } from 'react';
import { Link, Outlet, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Hourglass, Pencil, TriangleAlert } from 'lucide-react';
import { useDeleteScene, useProject, useRenameScene, useScene, useSessions } from '../../api/queries';
import { errorText } from '../../api/client';
import type { ProjectDetail, SceneDetail, SessionSummary } from '../../api/types';
import { TopBar } from '../../shell/TopBar';
import { Button, LinkButton } from '../../ui/Button';
import { ConfirmDialog } from '../../ui/Dialog';
import { Input } from '../../ui/Field';
import { ErrorState, Overline, Skeleton } from '../../ui/States';
import { RouteTabs } from '../../ui/Tabs';
import { useToast } from '../../ui/Toast';
import { useWindowTitle } from '../../lib/useWindowTitle';
import { formatBytes, formatCount, plural, sceneTitle } from '../../lib/format';

export interface SceneContext {
  project: ProjectDetail;
  scene: SceneDetail;
  /** `/projects/:id/scenes/:sceneId` */
  base: string;
}

// oxlint-disable-next-line react/only-export-components -- route context accessor, used by the tabs
export function useSceneContext(): SceneContext {
  return useOutletContext<SceneContext>();
}

/** Where a session or a scene version opens in 3D. */
// oxlint-disable-next-line react/only-export-components
export const viewerHref = {
  scene: (base: string, version?: number) => `${base}/view${version !== undefined ? `?version=${version}` : ''}`,
  session: (base: string, sessionId: string) => `${base}/sessions/${encodeURIComponent(sessionId)}`,
};

export function ScenePage() {
  const { projectId, sceneId } = useParams<{ projectId: string; sceneId: string }>();
  const project = useProject(projectId);
  const scene = useScene(project.data?.developerId, sceneId);
  const base = `/projects/${projectId}/scenes/${encodeURIComponent(sceneId ?? '')}`;
  const title = scene.data ? sceneTitle(scene.data) : 'Scene';
  useWindowTitle(title);

  const current = scene.data?.current ?? null;
  const sessions = useSessions(project.data?.developerId, scene.data?.sceneId, current ? { version: current.version } : null);
  const recording = (sessions.data ?? []).some((s: SessionSummary) => s.status === 'Recording');
  const error = project.error ?? scene.error;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar live={recording}>
        <Link to={`/projects/${projectId}`} className="inline-flex shrink-0 items-center gap-2 text-[15px] text-fg transition-colors hover:text-accent">
          <ArrowLeft className="h-4 w-4" />
          <span className="max-w-[180px] truncate">{project.data?.name ?? 'Project'}</span>
        </Link>
        <span className="hidden min-w-0 truncate text-[14px] text-fg-2 md:block">
          <span className="text-fg-3">/ </span>Scenes<span className="text-fg-3"> / </span>
          {title}
        </span>
      </TopBar>

      <main id="main" className="relative isolate flex-1">
        <div className="mx-auto w-full max-w-[1500px] px-5 pb-16 pt-10 sm:px-10 lg:px-14 lg:pt-12">
          {error ? (
            <ErrorState error={error} title="This scene did not load" onRetry={() => (project.isError ? project.refetch() : scene.refetch())} />
          ) : !project.data || !scene.data ? (
            <div className="space-y-6">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-16 w-80" />
              <Skeleton className="h-12 w-[520px]" />
              <Skeleton className="h-[320px]" />
            </div>
          ) : (
            <>
              <SceneHeader project={project.data} scene={scene.data} base={base} />
              <SceneWarnings scene={scene.data} />
              <RouteTabs
                className="mt-12"
                items={[
                  { to: base, label: 'Current version', end: true },
                  { to: `${base}/history`, label: 'Version history', count: (scene.data.current ? 1 : 0) + scene.data.archived.length },
                  { to: `${base}/settings`, label: 'Settings' },
                ]}
              />
              <div className="pt-9">
                <Outlet context={{ project: project.data, scene: scene.data, base } satisfies SceneContext} />
              </div>
              <p className="mt-16 text-[13px] text-fg-3">Scene data is immutable. Viewing never changes the export.</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function SceneHeader({ project, scene, base }: { project: ProjectDetail; scene: SceneDetail; base: string }) {
  const [renaming, setRenaming] = useState(false);
  const current = scene.current;

  return (
    <header className="flex flex-wrap items-start justify-between gap-6">
      <div className="min-w-0 max-w-full animate-rise">
        <Overline>Scene</Overline>
        {renaming ? (
          <RenameField project={project} scene={scene} onDone={() => setRenaming(false)} />
        ) : (
          <button type="button" onClick={() => setRenaming(true)} className="group mt-5 flex min-w-0 max-w-full items-center gap-3 text-left" aria-label={`Rename ${sceneTitle(scene)}`}>
            <h1 className="display truncate text-[46px] leading-[54px] text-fg sm:text-[64px] sm:leading-[72px]">{sceneTitle(scene)}</h1>
            <Pencil className="h-5 w-5 shrink-0 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>
        )}
        <p className="mt-3 truncate font-mono text-[13px] text-fg-2" title="The Unity scene's GUID">
          GUID <span className="text-fg-3">/</span> {scene.sceneId}
        </p>
      </div>
      {current && (
        <LinkButton to={viewerHref.scene(base)} className="min-w-[230px] justify-start sm:mt-10">
          Open latest in 3D
          <ArrowUpRight className="h-4 w-4" />
        </LinkButton>
      )}
    </header>
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
      className="mt-5 flex max-w-xl items-center gap-2"
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
        className="display h-14 text-[24px]"
      />
      <Button type="submit" loading={rename.isPending}>
        Save
      </Button>
      <Button variant="ghost" onClick={onDone}>
        Cancel
      </Button>
    </form>
  );
}

function SceneWarnings({ scene }: { scene: SceneDetail }) {
  const current = scene.current;
  const warnings: { key: string; icon: 'warn' | 'wait'; title: string; body: string }[] = [];
  if (current?.processingStatus === 'Failed') {
    warnings.push({
      key: 'optimize',
      icon: 'warn',
      title: 'This version could not be optimized',
      body: `${current.errorMessage ? `${current.errorMessage}. ` : ''}Replays use the unoptimized upload, which is larger and slower to open.`,
    });
  }
  if (current && current.skippedMeshCount > 0) {
    warnings.push({
      key: 'skipped',
      icon: 'warn',
      title: `${plural(current.skippedMeshCount, 'mesh', 'meshes')} left out of this export`,
      body: 'Unity could not read them, so they are missing from replays. Run MoodyBlues > Make Scene Meshes Readable, or export from the Editor with MoodyBlues > Export This Scene.',
    });
  }
  if (scene.awaitingSceneSessionCount > 0) {
    warnings.push({
      key: 'waiting',
      icon: 'wait',
      title: `${plural(scene.awaitingSceneSessionCount, 'session')} waiting for a scene version`,
      body: 'They were recorded in a version of this scene that was never uploaded. Export it from Unity with MoodyBlues > Export This Scene and they are built automatically.',
    });
  }
  if (warnings.length === 0) return null;
  return (
    <div className="mt-8 grid gap-3 xl:grid-cols-2">
      {warnings.map((w) => (
        <div key={w.key} className="flex items-start gap-4 rounded-[var(--radius-card)] border border-rule bg-ink-1 px-5 py-4">
          {w.icon === 'wait' ? <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-wait" /> : <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-caution" />}
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-fg">{w.title}</p>
            <p className="mt-1 text-[13px] leading-5 text-fg-2">{w.body}</p>
          </div>
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
            This deletes {plural(versions, 'version')}, {plural(sessions, 'session')} and <span className="text-fg">{formatBytes(scene.totalBytes)}</span> of files. It
            cannot be undone.
          </p>
          {live > 0 && <p className="text-caution">{plural(live, 'session is', 'sessions are')} recording right now. They will be stopped.</p>}
          <p>The next upload of this scene from Unity starts again at v.001.</p>
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

/** Counts that read well next to each other in a header. */
// oxlint-disable-next-line react/only-export-components
export function sessionTotals(scene: SceneDetail) {
  const versions = (scene.current ? 1 : 0) + scene.archived.length;
  const sessions = (scene.current?.sessionCount ?? 0) + scene.archived.reduce((n, v) => n + v.sessionCount, 0);
  return { versions, sessions, label: `${formatCount(sessions)} across ${plural(versions, 'version')}` };
}
