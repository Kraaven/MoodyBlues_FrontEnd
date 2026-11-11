import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, ChevronDown, ChevronRight, Download, Eye, MoreHorizontal, Trash2 } from 'lucide-react';
import { sceneFilePath, saveDownload, useDeleteArchive, useDeleteVersion, useSessions } from '../../api/queries';
import { errorText } from '../../api/client';
import type { SceneVersion, SessionSummary } from '../../api/types';
import { StageWindow } from '../../stage/StageWindow';
import { refKey, useStage, type StageView } from '../../stage/store';
import { useStageView } from '../../stage/useStageView';
import { Button, IconButton } from '../../ui/Button';
import { Tag, versionLabel, VersionStatus } from '../../ui/Chip';
import { CopyField } from '../../ui/CopyField';
import { ConfirmDialog } from '../../ui/Dialog';
import { Menu } from '../../ui/Menu';
import { SnapshotImage } from '../../ui/SnapshotImage';
import { ErrorState, Overline, Skeleton } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { formatBytes, formatCaptured, formatCompact, formatCount, formatDateTime, plural, safeFilename, sceneTitle } from '../../lib/format';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { AUTO_LOAD_MAX_BYTES } from '../ProjectPage';
import { useGlyphTimelines, useSessionIndexer } from './glyphs';
import { RecordingsEmpty, RecordingsTable } from './RecordingsTable';
import { DeleteSceneDialog, useSceneContext, viewerHref } from './ScenePage';

const NONE: StageView = { id: 'scene', content: 'none', dim: 0 };

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
          <span className="tabular font-mono text-[12px]">
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

function useSessionHref() {
  const { base } = useSceneContext();
  return (id: string) => viewerHref.session(base, id);
}

// ---- Current version ----------------------------------------------------------------------------

export function CurrentVersionTab() {
  const { project, scene, base } = useSceneContext();
  const href = useSessionHref();
  const current = scene.current;
  const phone = useMediaQuery('(max-width: 767px)');
  const [loadLarge, setLoadLarge] = useState(false);
  const sessions = useSessions(project.developerId, scene.sceneId, current ? { version: current.version } : null);
  const awaiting = useSessions(project.developerId, scene.sceneId, scene.awaitingSceneSessionCount > 0 ? { awaitingScene: true } : null);

  const ref = current ? { developerId: project.developerId, sceneId: scene.sceneId, hash: current.hash } : null;
  const tooBig = current !== null && current.sizeBytes > AUTO_LOAD_MAX_BYTES && !loadLarge;
  const live = ref !== null && !phone && !tooBig;
  const summary = useStage((s) => (ref ? s.summaries[refKey(ref)] : undefined));
  const sceneState = useStage((s) => s.scene);

  useStageView(
    live
      ? { id: 'scene', content: 'scene', scene: ref, control: 'free', idleOrbit: true, zoom: false, dim: 1, durationMs: 800 }
      : NONE,
  );

  if (!current) {
    return <RecordingsEmpty>This scene has no uploaded version yet. Export it from Unity with MoodyBlues &gt; Export This Scene.</RecordingsEmpty>;
  }

  return (
    <div className="space-y-16">
      <section className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
        {live ? (
          <StageWindow className="aspect-[16/8] min-h-[260px] rounded-[var(--radius-card)]">
            {sceneState.status === 'error' && sceneState.error !== null && (
              <div className="absolute inset-x-4 top-4">
                <ErrorState error={sceneState.error} title="The scene did not load" onRetry={() => useStage.getState().retryScene()} />
              </div>
            )}
            <Link
              to={viewerHref.scene(base)}
              className="glass absolute bottom-5 left-5 inline-flex h-11 min-w-[168px] items-center gap-2 rounded-[var(--radius-control)] border border-rule-strong/70 px-4 text-[14px] text-fg transition-colors hover:border-fg-3"
            >
              Explore in 3D <ArrowUpRight className="h-4 w-4" />
            </Link>
          </StageWindow>
        ) : (
          <div className="relative aspect-[16/8] min-h-[240px] overflow-hidden rounded-[var(--radius-card)]">
            <SnapshotImage hash={current.hash} seed={scene.sceneId} className="absolute inset-0 rounded-none" />
            <div className="absolute bottom-5 left-5 flex gap-2">
              {tooBig && !phone && (
                <Button variant="quiet" className="glass" onClick={() => setLoadLarge(true)}>
                  Load 3D · {formatBytes(current.sizeBytes)}
                </Button>
              )}
              <Link to={viewerHref.scene(base)} className="glass inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-rule-strong/70 px-4 text-[14px] text-fg">
                Explore in 3D <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        )}

        <div className="min-w-0">
          <div className="flex items-center gap-5">
            <p className="display text-[36px] leading-[42px] text-fg">{versionLabel(current.version)}</p>
            <Tag tone="accent">Latest</Tag>
            {current.processingStatus !== 'Ready' && <VersionStatus status={current.processingStatus} />}
          </div>
          <p className="mt-3 text-[15px] text-fg-2">Exported {formatCaptured(current.uploadedAtUtc).toLowerCase().replace(', ', ' at ')}</p>
          <dl className="mt-8 grid grid-cols-1 gap-x-12 border-t border-rule pt-4 sm:grid-cols-2">
            <Fact label="Tracked objects" value={formatCount(current.trackedObjectCount)} />
            <Fact label="Materials" value={summary ? formatCount(summary.materials) : '—'} />
            <Fact label="Textures" value={summary ? formatCount(summary.textures) : '—'} />
            <Fact label="Triangles" value={summary ? formatCompact(summary.triangles) : '—'} />
            <Fact label="Scene size" value={formatBytes(current.sizeBytes)} />
            <Fact label="Recordings" value={formatCount(current.sessionCount)} />
          </dl>
          {!summary && <p className="mt-3 text-[12px] text-fg-3">Materials, textures and triangles are counted once the scene has loaded here.</p>}
        </div>
      </section>

      {scene.awaitingSceneSessionCount > 0 && (
        <section className="space-y-4">
          <div className="flex items-baseline gap-4">
            <h2 className="display text-[24px] text-fg">Waiting for a scene version</h2>
            <span className="font-mono text-[12px] text-wait">{plural(scene.awaitingSceneSessionCount, 'session')}</span>
          </div>
          {awaiting.isError ? (
            <ErrorState error={awaiting.error} onRetry={() => awaiting.refetch()} />
          ) : awaiting.data ? (
            <RecordingsTable sessions={awaiting.data} sessionHref={href} />
          ) : (
            <Skeleton className="h-24" />
          )}
        </section>
      )}

      <section>
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
          <div className="flex items-baseline gap-5">
            <h2 className="display text-[28px] leading-8 text-fg">Recordings</h2>
            <span className="font-mono text-[13px] text-fg-2">
              {plural(current.sessionCount, 'session')} for {versionLabel(current.version)}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {sessions.data && <IndexSessions sessions={sessions.data} />}
            <p className="text-[13px] text-fg-3">Only sessions recorded against this export.</p>
          </div>
        </div>
        {sessions.isError ? (
          <ErrorState error={sessions.error} title="Recordings did not load" onRetry={() => sessions.refetch()} />
        ) : sessions.isPending ? (
          <Skeleton className="h-48" />
        ) : sessions.data.length === 0 ? (
          <RecordingsEmpty>No sessions in this version yet. Press Play in Unity with recording on, and the session appears here.</RecordingsEmpty>
        ) : (
          <RecordingsTable sessions={sessions.data} sessionHref={href} />
        )}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3.5">
      <dt className="text-[14px] text-fg-2">{label}</dt>
      <dd className="tabular font-mono text-[14px] text-fg">{value}</dd>
    </div>
  );
}

// ---- Version history ----------------------------------------------------------------------------

export function VersionHistoryTab() {
  useStageView(NONE);
  const { project, scene } = useSceneContext();
  const [deletingAll, setDeletingAll] = useState(false);
  const removeAll = useDeleteArchive(project.developerId, scene.sceneId);
  const notify = useToast();
  const name = sceneTitle(scene);
  const versions = [scene.current, ...scene.archived].filter((v): v is SceneVersion => v !== null);
  const archivedSessions = scene.archived.reduce((n, v) => n + v.sessionCount, 0);
  const archivedBytes = scene.archived.reduce((n, v) => n + v.sizeBytes + v.sessionBytes, 0);

  return (
    <div>
      <h2 className="display text-[24px] text-fg">{plural(versions.length, 'scene export')}</h2>
      <p className="mt-2 text-[15px] text-fg-2">Each export keeps its own geometry, assets and recordings.</p>

      <div className="mt-8 space-y-4">
        {versions.map((v) => (
          <VersionRow key={v.version} version={v} />
        ))}
      </div>

      {scene.archived.length > 0 && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-rule pt-6">
          <p className="font-mono text-[12px] text-fg-3">
            Archive: {plural(scene.archived.length, 'version')} · {plural(archivedSessions, 'session')} · {formatBytes(archivedBytes)}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setDeletingAll(true)}>
            <Trash2 className="h-4 w-4" />
            Delete all archived versions
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={deletingAll}
        onOpenChange={setDeletingAll}
        title={`Delete ${plural(scene.archived.length, 'archived version')} of ${name}?`}
        confirmLabel="Delete archive"
        typeToConfirm={name}
        body={
          <p>
            This deletes {plural(archivedSessions, 'session')} and <span className="text-fg">{formatBytes(archivedBytes)}</span>. The current version
            {scene.current ? ` ${versionLabel(scene.current.version)}` : ''} and its sessions are kept.
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

function VersionRow({ version: v }: { version: SceneVersion }) {
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
      await saveDownload(sceneFilePath(project.developerId, scene.sceneId, v.hash), safeFilename(`${name}-${versionLabel(v.version)}`, '.glb'));
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  return (
    <div className={cn('overflow-hidden rounded-[var(--radius-card)] border bg-ink-1 transition-colors duration-[180ms]', open ? 'border-rule-strong' : 'border-rule')}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 px-5 py-4 md:grid-cols-[minmax(150px,1fr)_minmax(140px,1fr)_minmax(110px,0.8fr)_minmax(110px,0.8fr)_auto]">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-w-0 items-center gap-5 text-left">
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-accent" /> : <ChevronRight className="h-4 w-4 shrink-0 text-fg-3" />}
          <span className={cn('tabular font-mono text-[16px]', open ? 'text-accent' : 'text-fg')}>{versionLabel(v.version)}</span>
          {v.isCurrent && <span className="text-[13px] text-accent">Latest</span>}
          {v.processingStatus !== 'Ready' && <VersionStatus status={v.processingStatus} />}
        </button>
        <span className="hidden text-[14px] text-fg-2 md:block" title={formatDateTime(v.uploadedAtUtc)}>
          {formatCaptured(v.uploadedAtUtc)}
        </span>
        <span className="tabular hidden font-mono text-[13px] text-fg-2 md:block">{formatCount(v.trackedObjectCount)} objects</span>
        <span className="hidden text-[14px] text-fg-2 md:block">{plural(v.sessionCount, 'recording')}</span>
        <div className="flex items-center justify-end gap-2">
          {v.isCurrent ? (
            <Button variant="secondary" className="min-w-[150px] justify-start" onClick={() => navigate(base)}>
              View current <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <span className="eyebrow hidden sm:inline">Archived</span>
          )}
          <Menu
            trigger={
              <IconButton label={`Actions for ${versionLabel(v.version)}`} size="sm" tooltip={false}>
                <MoreHorizontal className="h-4 w-4" />
              </IconButton>
            }
            items={[
              { label: 'Open in 3D', icon: Eye, onSelect: () => navigate(viewerHref.scene(base, v.version)) },
              { label: 'Download .glb', icon: Download, onSelect: () => void download() },
              ...(v.isCurrent ? [] : [{ label: 'Delete version', icon: Trash2, danger: true, separated: true, onSelect: () => setDeleting(true) }]),
            ]}
          />
        </div>
      </div>

      {open && (
        <div className="mx-5 border-t border-rule pb-5 pt-5">
          <div className="mb-3 flex items-center justify-between gap-4">
            <Overline>Recordings captured with {versionLabel(v.version)}</Overline>
            <span className="font-mono text-[12px] text-fg-3">
              {formatBytes(v.sizeBytes)} scene · {formatBytes(v.sessionBytes)} recordings
            </span>
          </div>
          {sessions.isError ? (
            <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />
          ) : sessions.isPending ? (
            <Skeleton className="h-24" />
          ) : sessions.data.length === 0 ? (
            <p className="py-4 text-[14px] text-fg-3">No sessions were recorded in this version.</p>
          ) : (
            <RecordingsTable sessions={sessions.data} sessionHref={href} nested />
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${versionLabel(v.version)} of ${name}?`}
        confirmLabel="Delete version"
        typeToConfirm={name}
        body={
          <p>
            This deletes {plural(v.sessionCount, 'session')} and <span className="text-fg">{formatBytes(v.sizeBytes + v.sessionBytes)}</span>.
          </p>
        }
        onConfirm={async () => {
          const r = await remove.mutateAsync(v.version);
          notify(`Deleted ${versionLabel(v.version)} and ${plural(r.deletedSessions, 'session')}, freed ${formatBytes(r.freedBytes)}.`);
        }}
      />
    </div>
  );
}

// ---- Settings -----------------------------------------------------------------------------------

export function SettingsTab() {
  useStageView(NONE);
  const { project, scene } = useSceneContext();
  const [deleting, setDeleting] = useState(false);
  const versions = (scene.current ? 1 : 0) + scene.archived.length;
  const sessions = (scene.current?.sessionCount ?? 0) + scene.archived.reduce((n, v) => n + v.sessionCount, 0) + scene.awaitingSceneSessionCount;

  return (
    <div className="max-w-3xl divide-y divide-rule rounded-[var(--radius-card)] border border-rule bg-ink-1">
      <section className="grid gap-4 p-7 sm:grid-cols-[200px_1fr]">
        <h3 className="text-[15px] text-fg">Display name</h3>
        <p className="text-[14px] text-fg-2">
          {scene.displayName ? <span className="text-fg">{scene.displayName}</span> : <span className="text-fg-3">Not set; the GUID is shown.</span>}
          <span className="mt-1 block text-[13px] text-fg-3">Click the scene's title to rename it. The Unity scene is not changed.</span>
        </p>
      </section>
      <section className="grid gap-4 p-7 sm:grid-cols-[200px_1fr]">
        <h3 className="text-[15px] text-fg">Scene GUID</h3>
        <div>
          <CopyField value={scene.sceneId} label="scene GUID" />
        </div>
      </section>
      <section className="grid gap-4 p-7 sm:grid-cols-[200px_1fr]">
        <h3 className="text-[15px] text-fg">Storage</h3>
        <p className="font-mono text-[13px] text-fg-2">
          {plural(versions, 'version')} · {plural(sessions, 'session')} · <span className="text-fg">{formatBytes(scene.totalBytes)}</span>
        </p>
      </section>
      <section className="grid gap-4 p-7 sm:grid-cols-[200px_1fr]">
        <h3 className="text-[15px] text-[#ff9a8e]">Delete scene</h3>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-sm text-[14px] text-fg-2">Removes every version, every session and all their files. You type the scene's name to confirm.</p>
          <Button variant="danger" onClick={() => setDeleting(true)}>
            <Trash2 className="h-4 w-4" />
            Delete scene
          </Button>
        </div>
      </section>
      <DeleteSceneDialog open={deleting} onOpenChange={setDeleting} project={project} scene={scene} />
    </div>
  );
}
