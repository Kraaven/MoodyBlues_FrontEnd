import { useMemo, useState } from 'react';
import { Archive, ChevronDown, ChevronRight, Download, Hourglass, MoreHorizontal, Trash2, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { sceneFilePath, saveDownload, useDeleteArchive, useDeleteVersion, useSessions } from '../../api/queries';
import { errorText } from '../../api/client';
import type { SceneVersion, SessionSummary } from '../../api/types';
import { Button, IconButton } from '../../ui/Button';
import { VersionChip, VersionStatusChip } from '../../ui/Chip';
import { ConfirmDialog } from '../../ui/Dialog';
import { CopyField } from '../../ui/CopyField';
import { Menu } from '../../ui/Menu';
import { EmptyState, ErrorState, SectionLabel, Skeleton } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { formatBytes, formatCount, formatRecorded, plural, safeFilename, sceneTitle } from '../../lib/format';
import { useGlyphTimelines, useSessionIndexer } from './glyphs';
import { SessionReel, SessionsEmpty } from './SessionReel';
import { DeleteSceneDialog, useSceneContext } from './ScenePage';

/**
 * Offers to read the replays of sessions that only have a summary glyph, so each gets a true timeline
 * (DESIGN.md 7.6). Never runs by itself.
 */
function IndexSessions({ sessions }: { sessions: SessionSummary[] }) {
  const timelines = useGlyphTimelines(sessions);
  const missing = useMemo(() => sessions.filter((s) => s.status === 'Ready' && !timelines.has(s.id)), [sessions, timelines]);
  const { state, start, cancel } = useSessionIndexer(missing);
  if (!state.running && missing.length === 0) return null;

  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-rule bg-ink-1/70 px-4 py-2.5 text-[12px] backdrop-blur-sm">
      <p className="min-w-0 text-fg-3" role="status">
        {state.running
          ? `Reading replays: ${state.done} of ${state.total}${state.failed > 0 ? `, ${state.failed} failed` : ''}`
          : `Reading the replays of ${plural(missing.length, 'session')} gives each a true timeline instead of a summary.`}
      </p>
      {state.running ? (
        <Button size="sm" variant="ghost" onClick={cancel}>
          Cancel
        </Button>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => void start()}>
          Index sessions
        </Button>
      )}
    </div>
  );
}

function useSessionHref() {
  const { base } = useSceneContext();
  return (id: string) => `${base}/sessions/${encodeURIComponent(id)}`;
}

// ---- Sessions ---------------------------------------------------------------------------------

export function SessionsTab() {
  const { project, scene } = useSceneContext();
  const href = useSessionHref();
  const current = scene.current;
  const sessions = useSessions(project.developerId, scene.sceneId, current ? { version: current.version } : null);
  const awaiting = useSessions(project.developerId, scene.sceneId, scene.awaitingSceneSessionCount > 0 ? { awaitingScene: true } : null);

  return (
    <div className="space-y-8">
      {scene.awaitingSceneSessionCount > 0 && (
        <section className="space-y-3">
          <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-caution/25 bg-caution/[0.06] px-4 py-3">
            <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-caution" />
            <div className="space-y-1 text-[13px]">
              <p className="font-semibold text-fg">Waiting for a scene version ({formatCount(scene.awaitingSceneSessionCount)})</p>
              <p className="text-fg-2">
                These sessions were recorded in a scene version that has not been uploaded. Export it from Unity with{' '}
                <span className="text-fg">MoodyBlues &gt; Export This Scene</span> and they are built automatically.
              </p>
            </div>
          </div>
          {awaiting.isError ? (
            <ErrorState error={awaiting.error} onRetry={() => awaiting.refetch()} />
          ) : awaiting.data ? (
            <SessionReel sessions={awaiting.data} sessionHref={href} />
          ) : (
            <Skeleton className="h-24" />
          )}
        </section>
      )}

      <section className="space-y-3">
        {scene.awaitingSceneSessionCount > 0 && <SectionLabel>Recorded in v{current?.version}</SectionLabel>}
        {!current ? (
          <SessionsEmpty>This scene has no uploaded version.</SessionsEmpty>
        ) : sessions.isError ? (
          <ErrorState error={sessions.error} title="Sessions did not load" onRetry={() => sessions.refetch()} />
        ) : sessions.isPending ? (
          <Skeleton className="h-40" />
        ) : sessions.data.length === 0 ? (
          <SessionsEmpty>No sessions in this version yet. Play the scene with recording on and it appears here.</SessionsEmpty>
        ) : (
          <>
            <IndexSessions sessions={sessions.data} />
            <SessionReel sessions={sessions.data} sessionHref={href} />
          </>
        )}
      </section>
    </div>
  );
}

// ---- Archive ----------------------------------------------------------------------------------

export function ArchiveTab() {
  const { project, scene } = useSceneContext();
  const [deletingAll, setDeletingAll] = useState(false);
  const removeAll = useDeleteArchive(project.developerId, scene.sceneId);
  const notify = useToast();
  const name = sceneTitle(scene);

  if (scene.archived.length === 0) {
    return (
      <EmptyState icon={Archive} title="No archived versions">
        When a new version of this scene is uploaded, the previous one moves here with its sessions.
      </EmptyState>
    );
  }

  const sessions = scene.archived.reduce((n, v) => n + v.sessionCount, 0);
  const bytes = scene.archived.reduce((n, v) => n + v.sizeBytes + v.sessionBytes, 0);

  return (
    <div className="space-y-3">
      {scene.archived.map((v) => (
        <ArchivedVersion key={v.version} version={v} />
      ))}

      <div className="flex items-center justify-between gap-4 pt-4">
        <p className="text-[13px] text-fg-3">
          {plural(scene.archived.length, 'archived version')} · {plural(sessions, 'session')} · {formatBytes(bytes)}
        </p>
        <Button variant="secondary" size="sm" onClick={() => setDeletingAll(true)}>
          <Trash2 className="h-4 w-4" />
          Delete all archived versions
        </Button>
      </div>

      <ConfirmDialog
        open={deletingAll}
        onOpenChange={setDeletingAll}
        title={`Delete ${plural(scene.archived.length, 'archived version')} of ${name}?`}
        confirmLabel="Delete archive"
        typeToConfirm={name}
        body={
          <p>
            This deletes {plural(sessions, 'session')} and <span className="text-fg">{formatBytes(bytes)}</span>. The current version
            {scene.current ? ` v${scene.current.version}` : ''} and its sessions are kept.
          </p>
        }
        onConfirm={async () => {
          const r = await removeAll.mutateAsync();
          notify(`Deleted ${plural(r.deletedVersions, 'version')} and ${plural(r.deletedSessions, 'session')}, freed ${formatBytes(r.freedBytes)}.`);
        }}
      />
    </div>
  );
}

function ArchivedVersion({ version: v }: { version: SceneVersion }) {
  const { project, scene, base } = useSceneContext();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const href = useSessionHref();
  const notify = useToast();
  const remove = useDeleteVersion(project.developerId, scene.sceneId);
  const sessions = useSessions(project.developerId, scene.sceneId, open ? { version: v.version } : null);
  const name = sceneTitle(scene);

  const download = async () => {
    try {
      await saveDownload(sceneFilePath(project.developerId, scene.sceneId, v.hash), safeFilename(`${name}-v${v.version}`, '.glb'));
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-rule bg-ink-1/85 backdrop-blur-sm">
      <div className={cn('flex items-center gap-3 px-4 py-3', open && 'border-b border-rule')}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {open ? <ChevronDown className="h-4 w-4 text-fg-3" /> : <ChevronRight className="h-4 w-4 text-fg-3" />}
          <VersionChip version={v.version} />
          <span className="truncate text-[13px] text-fg-2">
            Uploaded {formatRecorded(v.uploadedAtUtc)} · {plural(v.sessionCount, 'session')} · {formatBytes(v.sizeBytes + v.sessionBytes)}
          </span>
        </button>
        {v.processingStatus !== 'Ready' && <VersionStatusChip status={v.processingStatus} />}
        {v.skippedMeshCount > 0 && <span className="text-[12px] text-caution">{plural(v.skippedMeshCount, 'mesh', 'meshes')} missing</span>}
        <Menu
          trigger={
            <IconButton label={`Actions for v${v.version}`} size="sm" tooltip={false}>
              <MoreHorizontal className="h-4 w-4" />
            </IconButton>
          }
          items={[
            { label: 'Inspect', icon: Eye, onSelect: () => navigate(`${base}/inspect?version=${v.version}`) },
            { label: 'Download .glb', icon: Download, onSelect: () => void download() },
            { label: 'Delete version', icon: Trash2, danger: true, separated: true, onSelect: () => setDeleting(true) },
          ]}
        />
      </div>
      {open && (
        <div className="p-3">
          {sessions.isError ? (
            <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />
          ) : sessions.isPending ? (
            <Skeleton className="h-24" />
          ) : sessions.data.length === 0 ? (
            <SessionsEmpty>No sessions were recorded in this version.</SessionsEmpty>
          ) : (
            <SessionReel sessions={sessions.data} sessionHref={href} />
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete v${v.version} of ${name}?`}
        confirmLabel="Delete version"
        typeToConfirm={name}
        body={
          <p>
            This deletes {plural(v.sessionCount, 'session')} and <span className="text-fg">{formatBytes(v.sizeBytes + v.sessionBytes)}</span>.
          </p>
        }
        onConfirm={async () => {
          const r = await remove.mutateAsync(v.version);
          notify(`Deleted v${v.version} and ${plural(r.deletedSessions, 'session')}, freed ${formatBytes(r.freedBytes)}.`);
        }}
      />
    </div>
  );
}

// ---- Settings ---------------------------------------------------------------------------------

export function SettingsTab() {
  const { project, scene } = useSceneContext();
  const [deleting, setDeleting] = useState(false);
  const versions = (scene.current ? 1 : 0) + scene.archived.length;
  const sessions = (scene.current?.sessionCount ?? 0) + scene.archived.reduce((n, v) => n + v.sessionCount, 0) + scene.awaitingSceneSessionCount;

  return (
    <div className="max-w-2xl space-y-6">
      <section className="space-y-4 rounded-[var(--radius-card)] border border-rule bg-ink-1/85 backdrop-blur-sm p-5">
        <h2 className="text-[16px] font-semibold text-fg">Scene</h2>
        <dl className="space-y-4 text-[13px]">
          <div className="space-y-1.5">
            <dt className="text-fg-3">Display name</dt>
            <dd className="text-fg">
              {scene.displayName ?? <span className="text-fg-3">Not set</span>}
              <span className="ml-2 text-fg-3">Rename it from the scene header. Unity's scene is not changed.</span>
            </dd>
          </div>
          <div className="space-y-1.5">
            <dt className="text-fg-3">Scene GUID</dt>
            <dd>
              <CopyField value={scene.sceneId} label="scene GUID" />
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3 rounded-[var(--radius-card)] border border-rule bg-ink-1/85 backdrop-blur-sm p-5">
        <h2 className="text-[16px] font-semibold text-fg">Storage</h2>
        <p className="text-[13px] text-fg-2">
          {plural(versions, 'version')} · {plural(sessions, 'session')} · <span className="text-fg">{formatBytes(scene.totalBytes)}</span> in total
        </p>
      </section>

      <section className="space-y-3 rounded-[var(--radius-card)] border border-danger/30 p-5">
        <h2 className="text-[16px] font-semibold text-fg">Danger zone</h2>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-md text-[13px] text-fg-2">Deleting the scene removes every version, every session and all their files.</p>
          <Button variant="danger" size="sm" onClick={() => setDeleting(true)}>
            <Trash2 className="h-4 w-4" />
            Delete scene
          </Button>
        </div>
      </section>
      <DeleteSceneDialog open={deleting} onOpenChange={setDeleting} project={project} scene={scene} />
    </div>
  );
}
