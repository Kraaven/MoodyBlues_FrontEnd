import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight, Mountain, Wrench } from 'lucide-react';
import { useProject } from '../api/queries';
import { AppShell, PageHeader } from '../shell/AppShell';
import { Button } from '../ui/Button';
import { VersionChip, VersionStatusChip } from '../ui/Chip';
import { Dialog } from '../ui/Dialog';
import { SceneCover } from '../ui/SceneCover';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import { formatBytes, formatRecorded, sceneTitle } from '../lib/format';
import { ConnectionControl, ConnectionField } from './Connection';

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

  const name = project.data?.name ?? 'Project';

  return (
    <AppShell crumbs={[{ label: 'Projects', to: '/projects' }, { label: name }]}>
      {project.isError ? (
        <ErrorState error={project.error} title="This project did not load" onRetry={() => project.refetch()} />
      ) : project.isPending ? (
        <div className="space-y-6">
          <Skeleton className="h-12 w-72" />
          <Skeleton className="h-[72px]" />
          <Skeleton className="h-[72px]" />
        </div>
      ) : (
        <>
          <PageHeader
            title={project.data.name}
            meta={<ConnectionControl project={project.data} />}
            actions={
              <Button variant="secondary" onClick={() => setSetupOpen(true)}>
                <Wrench className="h-4 w-4" />
                Unity setup
              </Button>
            }
          />

          <h2 className="mb-3 text-[16px] font-semibold text-fg">Scenes</h2>
          {project.data.scenes.length === 0 ? (
            <EmptyState icon={Mountain} title="No scenes yet">
              <div className="mt-4 text-left">
                <SetupSteps connectionString={project.data.connectionString} />
              </div>
            </EmptyState>
          ) : (
            <ul className="overflow-hidden rounded-[var(--radius-card)] border border-rule bg-ink-1">
              {project.data.scenes.map((scene, i) => (
                <li key={scene.sceneId} className="animate-rise border-b border-rule last:border-b-0" style={{ animationDelay: `${Math.min(i, 8) * 20}ms` }}>
                  <Link
                    to={`/projects/${project.data.id}/scenes/${encodeURIComponent(scene.sceneId)}`}
                    className="group flex items-center gap-4 px-4 py-3 transition-colors duration-[120ms] hover:bg-ink-2"
                  >
                    <SceneCover seed={scene.sceneId} className="h-12 w-[72px] shrink-0" />
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

          <Dialog open={setupOpen} onOpenChange={setSetupOpen} title="Record a Unity scene" width="md">
            <SetupSteps connectionString={project.data.connectionString} />
          </Dialog>
        </>
      )}
    </AppShell>
  );
}
