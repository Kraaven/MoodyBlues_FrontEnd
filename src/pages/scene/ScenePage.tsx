import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronDown, Copy, Download, Hourglass, Layers, MoreHorizontal, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { sceneFilePath, saveDownload, useDeleteScene, useProject, useRenameScene, useScene, useSessions } from '../../api/queries';
import { errorText } from '../../api/client';
import type { ProjectDetail, SceneDetail, SceneVersion, SessionSummary } from '../../api/types';
import { PageBody, WorkspaceLayout } from '../../shell/WorkspaceLayout';
import type { StageView } from '../../stage/store';
import { useStageView } from '../../stage/useStageView';
import { Button, IconButton, LinkButton } from '../../ui/Button';
import { versionLabel, VersionStatus } from '../../ui/Chip';
import { ConfirmDialog } from '../../ui/Dialog';
import { Input } from '../../ui/Field';
import { Menu } from '../../ui/Menu';
import { EmptyState, ErrorState, Skeleton } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { useWindowTitle } from '../../lib/useWindowTitle';
import { formatBytes, formatCaptured, formatCount, plural, safeFilename, sceneTitle } from '../../lib/format';
import { useGlyphTimelines, useSessionIndexer } from './glyphs';
import { RecordingsTable } from './RecordingsTable';
import { VersionsDialog } from './VersionsDialog';

const NONE: StageView = { id: 'scene', content: 'none', dim: 0 };

/** Where a session or a scene version opens in 3D. */
// oxlint-disable-next-line react/only-export-components
export const viewerHref = {
  scene: (base: string, version?: number) => `${base}/view${version !== undefined ? `?version=${version}` : ''}`,
  session: (base: string, sessionId: string) => `${base}/sessions/${encodeURIComponent(sessionId)}`,
};

/**
 * One scene, one page: what it is, which export you are looking at, and the recordings made in it.
 * Everything else (rename, download, older exports, delete) lives in the menu beside the title.
 */
export function ScenePage() {
  useStageView(NONE);
  const { projectId, sceneId } = useParams<{ projectId: string; sceneId: string }>();
  const [search, setSearch] = useSearchParams();
  const project = useProject(projectId);
  const scene = useScene(project.data?.developerId, sceneId);
  const base = `/projects/${projectId}/scenes/${encodeURIComponent(sceneId ?? '')}`;
  const title = scene.data ? sceneTitle(scene.data) : 'Scene';
  useWindowTitle(title);

  const versions = useMemo(() => (scene.data ? [scene.data.current, ...scene.data.archived].filter((v): v is SceneVersion => v !== null) : []), [scene.data]);
  const requested = Number(search.get('version'));
  const selected = versions.find((v) => v.version === requested) ?? scene.data?.current ?? null;
  const error = project.error ?? scene.error;

  return (
    <WorkspaceLayout
      crumbs={[
        { label: 'Projects', to: '/projects' },
        { label: project.data?.name ?? 'Project', to: `/projects/${projectId}`, switcher: true },
        { label: title },
      ]}
    >
      <PageBody>
        {error ? (
          <ErrorState error={error} title="This scene did not load" onRetry={() => (project.isError ? project.refetch() : scene.refetch())} />
        ) : !project.data || !scene.data ? (
          <div className="space-y-6">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <SceneBody
            project={project.data}
            scene={scene.data}
            versions={versions}
            selected={selected}
            base={base}
            onSelect={(v) => setSearch(v.isCurrent ? {} : { version: String(v.version) }, { replace: true })}
          />
        )}
      </PageBody>
    </WorkspaceLayout>
  );
}

function SceneBody({
  project,
  scene,
  versions,
  selected,
  base,
  onSelect,
}: {
  project: ProjectDetail;
  scene: SceneDetail;
  versions: SceneVersion[];
  selected: SceneVersion | null;
  base: string;
  onSelect: (v: SceneVersion) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [managing, setManaging] = useState(false);
  const notify = useToast();
  const navigate = useNavigate();
  const name = sceneTitle(scene);

  const sessions = useSessions(project.developerId, scene.sceneId, selected ? { version: selected.version } : null);
  const awaitingShown = Boolean(selected?.isCurrent) && scene.awaitingSceneSessionCount > 0;
  const awaiting = useSessions(project.developerId, scene.sceneId, awaitingShown ? { awaitingScene: true } : null);
  const sessionHref = (id: string) => viewerHref.session(base, id);

  const download = async () => {
    if (!selected) return;
    try {
      await saveDownload(sceneFilePath(project.developerId, scene.sceneId, selected.hash), safeFilename(`${name}-${versionLabel(selected.version)}`, '.glb'));
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };
  const copyGuid = async () => {
    try {
      await navigator.clipboard.writeText(scene.sceneId);
      notify('Scene GUID copied.');
    } catch {
      notify('Could not copy the GUID.', 'error');
    }
  };

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-full flex-1">
          {renaming ? (
            <RenameField project={project} scene={scene} onDone={() => setRenaming(false)} />
          ) : (
            <h1 className="display truncate text-[30px] leading-9 text-fg sm:text-[34px] sm:leading-10">{name}</h1>
          )}
          {selected && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-fg-2">
              <span>{versionLabel(selected.version)}</span>
              <Dot />
              <span>Exported {formatCaptured(selected.uploadedAtUtc)}</span>
              <Dot />
              <span>{plural(selected.trackedObjectCount, 'object')}</span>
              <Dot />
              <span>{formatBytes(selected.sizeBytes)}</span>
              {selected.processingStatus !== 'Ready' && <VersionStatus status={selected.processingStatus} />}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {versions.length > 1 && selected && (
            <Menu
              trigger={
                <Button variant="secondary" aria-label="Choose a scene version">
                  {versionLabel(selected.version)}
                  <ChevronDown className="h-3.5 w-3.5 text-fg-3" />
                </Button>
              }
              items={versions.map((v) => ({ label: `${versionLabel(v.version)}${v.isCurrent ? ' · latest' : ''}`, hint: plural(v.sessionCount, 'rec'), onSelect: () => onSelect(v) }))}
            />
          )}
          {selected && <LinkButton to={viewerHref.scene(base, selected.isCurrent ? undefined : selected.version)}>Open in 3D</LinkButton>}
          <Menu
            trigger={
              <IconButton label="Scene actions" tooltip={false}>
                <MoreHorizontal className="h-5 w-5" />
              </IconButton>
            }
            items={[
              { label: 'Rename', icon: Pencil, onSelect: () => setRenaming(true) },
              { label: 'Copy scene GUID', icon: Copy, onSelect: () => void copyGuid() },
              { label: 'Download .glb', icon: Download, disabled: !selected, onSelect: () => void download() },
              ...(scene.archived.length > 0 ? [{ label: 'Manage versions', icon: Layers, separated: true, onSelect: () => setManaging(true) }] : []),
              { label: 'Delete scene', icon: Trash2, danger: true, separated: true, onSelect: () => setDeleting(true) },
            ]}
          />
        </div>
      </header>

      <SceneWarnings scene={scene} />

      {!selected ? (
        <EmptyState className="mt-10" title="No version uploaded yet">
          Export this scene from Unity with MoodyBlues &gt; Export This Scene. It appears here when the upload finishes.
        </EmptyState>
      ) : (
        <section aria-label="Recordings" className="mt-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-[16px] font-medium text-fg">
              Recordings <span className="ml-1 font-normal text-fg-3">{formatCount(sessions.data?.length ?? selected.sessionCount)}</span>
            </h2>
            {sessions.data && <IndexSessions sessions={sessions.data} />}
          </div>
          {sessions.isError ? (
            <ErrorState error={sessions.error} title="Recordings did not load" onRetry={() => sessions.refetch()} />
          ) : sessions.isPending ? (
            <Skeleton className="h-48" />
          ) : sessions.data.length === 0 ? (
            <EmptyState title="No recordings in this version">Press Play in Unity with recording on, and the session appears here.</EmptyState>
          ) : (
            <RecordingsTable sessions={sessions.data} sessionHref={sessionHref} />
          )}
        </section>
      )}

      {awaitingShown && (
        <section aria-label="Waiting for a scene version" className="mt-12">
          <h2 className="mb-4 text-[16px] font-medium text-fg">
            Waiting for a scene version <span className="ml-1 font-normal text-wait">{formatCount(scene.awaitingSceneSessionCount)}</span>
          </h2>
          {awaiting.isError ? (
            <ErrorState error={awaiting.error} onRetry={() => awaiting.refetch()} />
          ) : awaiting.data ? (
            <RecordingsTable sessions={awaiting.data} sessionHref={sessionHref} />
          ) : (
            <Skeleton className="h-24" />
          )}
        </section>
      )}

      <VersionsDialog open={managing} onOpenChange={setManaging} project={project} scene={scene} base={base} onOpen={(href) => navigate(href)} />
      <DeleteSceneDialog open={deleting} onOpenChange={setDeleting} project={project} scene={scene} />
    </>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" className="text-fg-3">
      ·
    </span>
  );
}

/** Offers to read the replays of sessions that only have a summary glyph, so each gets a true timeline. Never runs by itself. */
function IndexSessions({ sessions }: { sessions: SessionSummary[] }) {
  const timelines = useGlyphTimelines(sessions);
  const missing = useMemo(() => sessions.filter((s) => s.status === 'Ready' && !timelines.has(s.id)), [sessions, timelines]);
  const { state, start, cancel } = useSessionIndexer(missing);
  if (!state.running && missing.length === 0) return null;
  return (
    <div className="flex items-center gap-3 text-[13px] text-fg-3" role="status">
      {state.running ? (
        <>
          <span className="tabular">
            Reading replays {state.done}/{state.total}
            {state.failed > 0 && `, ${state.failed} failed`}
          </span>
          <Button size="sm" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => void start()} title="Reads each replay once in this browser, so its activity strip shows when things happened">
          Index {plural(missing.length, 'session')}
        </Button>
      )}
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
      className="flex max-w-xl items-center gap-2"
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
        className="h-11 text-[18px]"
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
  if (warnings.length === 0) return null;
  return (
    <div className="mt-6 space-y-2">
      {warnings.map((w) => (
        <div key={w.key} className="flex items-start gap-3 rounded-[var(--radius-card)] border border-rule bg-ink-1 px-4 py-3">
          {w.icon === 'wait' ? <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-wait" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-caution" />}
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-fg">{w.title}</p>
            <p className="mt-0.5 text-[13px] leading-5 text-fg-2">{w.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DeleteSceneDialog({ open, onOpenChange, project, scene }: { open: boolean; onOpenChange: (open: boolean) => void; project: ProjectDetail; scene: SceneDetail }) {
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
