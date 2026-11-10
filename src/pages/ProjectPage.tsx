import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Mountain, Wrench } from 'lucide-react';
import { useProject, useSessions } from '../api/queries';
import type { ProjectScene } from '../api/types';
import { ViewShell, PageHeader } from '../shell/ViewShell';
import { useBrowseStage } from '../stage/browseStage';
import { RecIndicator } from '../stage/RecIndicator';
import { Button } from '../ui/Button';
import { VersionChip, VersionStatusChip } from '../ui/Chip';
import { Sheet } from '../ui/Sheet';
import { SnapshotImage } from '../ui/SnapshotImage';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import { formatBytes, formatRecorded, sceneTitle } from '../lib/format';
import { ConnectionControl, ConnectionField } from './Connection';

/** Scenes above this size are not loaded just because the pointer rested on them (DESIGN.md 4.5). */
const HOVER_PREVIEW_MAX_BYTES = 25 * 1024 * 1024;
/** How long the pointer must rest on a scene before the Stage shows it. */
const HOVER_DELAY_MS = 600;

/** The steps from DESIGN.md 7.3, "Getting started". `connectionString` is shown when the project has one. */
export function SetupSteps({ connectionString }: { connectionString: string | null }) {
  return (
    <ol className="space-y-4 text-sm text-fg-2">
      <li className="flex gap-3">
        <StepNumber n={1} />
        <div className="min-w-0 space-y-2">
          <p>
            In Unity, open <span className="text-fg">MoodyBlues &gt; Settings</span>, paste this project's connection string and click{' '}
            <span className="text-fg">Test Connection</span>. It is set once for the whole Unity project.
          </p>
          <div className="flex flex-wrap gap-2">
            {connectionString ? (
              <ConnectionField connectionString={connectionString} />
            ) : (
              <span className="text-[13px] text-fg-3">(the connection string, from the project's page)</span>
            )}
          </div>
        </div>
      </li>
      <li className="flex gap-3">
        <StepNumber n={2} />
        <p>
          Add <span className="font-mono text-[13px] text-fg">MoodyBluesSessionManager</span> and{' '}
          <span className="font-mono text-[13px] text-fg">MoodyBluesRuntimeManager</span> to the scene. A Scene Config is optional; without
          one the defaults are used.
        </p>
      </li>
      <li className="flex gap-3">
        <StepNumber n={3} />
        <p>
          Build the game, or run <span className="text-fg">MoodyBlues &gt; Export This Scene</span>. The scene appears here,
          and every recording of it after that.
        </p>
      </li>
    </ol>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-blue/40 bg-blue/10 font-mono text-[12px] text-blue-bright">
      {n}
    </span>
  );
}

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId);
  const [setupOpen, setSetupOpen] = useState(false);
  const [hovered, setHovered] = useState<ProjectScene | null>(null);
  const timers = useRef<{ enter?: number; leave?: number }>({});

  const data = project.data;
  const latest = data ? [...data.scenes].sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc))[0] : undefined;

  // The Stage shows the scene the pointer rested on, otherwise the dimmed Trace.
  useBrowseStage(hovered && data ? { developerId: data.developerId, sceneId: hovered.sceneId, hash: hovered.latestHash } : null);
  useEffect(
    () => () => {
      window.clearTimeout(timers.current.enter);
      window.clearTimeout(timers.current.leave);
    },
    [],
  );

  const sessions = useSessions(data?.developerId, latest?.sceneId, latest ? { version: latest.currentVersion } : null);
  const recording = (sessions.data ?? []).filter((s) => s.status === 'Recording');

  const onEnter = (scene: ProjectScene) => {
    window.clearTimeout(timers.current.leave);
    window.clearTimeout(timers.current.enter);
    if (scene.sizeBytes > HOVER_PREVIEW_MAX_BYTES || scene.processingStatus !== 'Ready') return;
    timers.current.enter = window.setTimeout(() => setHovered(scene), HOVER_DELAY_MS);
  };
  const onLeave = () => {
    window.clearTimeout(timers.current.enter);
    window.clearTimeout(timers.current.leave);
    timers.current.leave = window.setTimeout(() => setHovered(null), 300);
  };

  const name = data?.name ?? 'Project';
  const base = data && latest ? `/projects/${data.id}/scenes/${encodeURIComponent(latest.sceneId)}` : '';
  const trailing =
    recording.length > 0 ? (
      <RecIndicator count={recording.length} to={recording.length === 1 ? `${base}/sessions/${encodeURIComponent(recording[0].id)}` : base} />
    ) : undefined;

  return (
    <ViewShell crumbs={[{ label: 'Projects', to: '/projects' }, { label: name }]} trailing={trailing}>
      {project.isError ? (
        <ErrorState error={project.error} title="This project did not load" onRetry={() => project.refetch()} />
      ) : !data ? (
        <div className="space-y-6">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-[72px]" />
          <Skeleton className="h-[72px]" />
        </div>
      ) : (
        <>
          <PageHeader
            title={data.name}
            meta={<ConnectionControl project={data} />}
            actions={
              <Button variant="secondary" onClick={() => setSetupOpen(true)}>
                <Wrench className="h-4 w-4" />
                Unity setup
              </Button>
            }
          />

          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">Scenes</h2>
          {data.scenes.length === 0 ? (
            <EmptyState icon={Mountain} title="No scenes yet" className="bg-ink-1/70 backdrop-blur-sm">
              <div className="mt-4 text-left">
                <SetupSteps connectionString={data.connectionString} />
              </div>
            </EmptyState>
          ) : (
            <ul className="overflow-hidden rounded-[var(--radius-card)] border border-rule bg-ink-1/85 backdrop-blur-sm">
              {data.scenes.map((scene, i) => (
                <li key={scene.sceneId} className="animate-rise border-b border-rule last:border-b-0" style={{ animationDelay: `${Math.min(i, 8) * 20}ms` }}>
                  <Link
                    to={`/projects/${data.id}/scenes/${encodeURIComponent(scene.sceneId)}`}
                    onMouseEnter={() => onEnter(scene)}
                    onMouseLeave={onLeave}
                    onFocus={() => onEnter(scene)}
                    onBlur={onLeave}
                    className="group flex items-center gap-4 px-4 py-3 transition-colors duration-[120ms] hover:bg-ink-2/90 focus-visible:bg-ink-2/90"
                  >
                    <SnapshotImage hash={scene.latestHash} seed={scene.sceneId} className="h-[52px] w-[92px] shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-fg">{sceneTitle(scene)}</p>
                      <p className="mt-0.5 truncate text-[13px] text-fg-3">
                        Uploaded {formatRecorded(scene.updatedAtUtc)} · {formatBytes(scene.sizeBytes)}
                      </p>
                    </div>
                    <div className="hidden items-center gap-2 sm:flex">
                      {scene.processingStatus !== 'Ready' && <VersionStatusChip status={scene.processingStatus} />}
                      {scene.currentVersion > 0 && <VersionChip version={scene.currentVersion} />}
                    </div>
                    <ChevronRight className="h-4 w-4 text-fg-3 transition-transform duration-[120ms] group-hover:translate-x-0.5 group-hover:text-fg-2" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Sheet open={setupOpen} onOpenChange={setSetupOpen} title="Record a Unity scene">
            <SetupSteps connectionString={data.connectionString} />
          </Sheet>
        </>
      )}
    </ViewShell>
  );
}
