import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, KeyRound } from 'lucide-react';
import { useProject } from '../api/queries';
import type { ProjectDetail, ProjectScene } from '../api/types';
import { ConnectionDialog } from '../shell/ConnectionDialog';
import { SetupSteps } from '../shell/SetupGuide';
import { PageBody, PageHeader, WorkspaceLayout } from '../shell/WorkspaceLayout';
import type { StageView } from '../stage/store';
import { useStageView } from '../stage/useStageView';
import { Button } from '../ui/Button';
import { versionLabel, VersionStatus } from '../ui/Chip';
import { SnapshotImage } from '../ui/SnapshotImage';
import { ErrorState, Skeleton } from '../ui/States';
import { formatBytes, formatCaptured, plural, sceneTitle } from '../lib/format';
import { useWindowTitle } from '../lib/useWindowTitle';

const NONE: StageView = { id: 'project', content: 'none', dim: 0 };

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [params, setParams] = useSearchParams();
  const project = useProject(projectId);
  const [connecting, setConnecting] = useState(false);
  const data = project.data;
  useWindowTitle(data?.name ?? 'Project');
  useStageView(NONE);

  // Arriving from "Create project": open the Unity connection straight away.
  useEffect(() => {
    if (params.get('connect') && data) {
      setConnecting(true);
      setParams({}, { replace: true });
    }
  }, [params, data, setParams]);

  const scenes = useMemo(() => (data ? [...data.scenes].sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc)) : []), [data]);
  const keyless = data && !data.ingestKeyPrefix;

  return (
    <WorkspaceLayout crumbs={[{ label: 'Projects', to: '/projects' }, { label: data?.name ?? 'Project', switcher: true }]}>
      <PageBody>
        {project.isError ? (
          <ErrorState error={project.error} title="This project did not load" onRetry={() => project.refetch()} />
        ) : !data ? (
          <div className="space-y-6">
            <Skeleton className="h-10 w-72" />
            <Skeleton className="h-64" />
          </div>
        ) : (
          <>
            <PageHeader
              title={data.name}
              meta={plural(scenes.length, 'scene')}
              actions={
                <Button variant={keyless ? 'primary' : 'secondary'} onClick={() => setConnecting(true)}>
                  <KeyRound className="h-4 w-4" />
                  {keyless ? 'Create connection key' : 'Unity connection'}
                </Button>
              }
            />

            {scenes.length === 0 ? (
              <section className="mt-10 rounded-[var(--radius-card)] border border-dashed border-rule-strong p-7 sm:p-9">
                <h2 className="display text-[22px] leading-7 text-fg">No scenes yet</h2>
                <p className="mt-2 max-w-lg text-[14px] text-fg-2">Connect Unity and export a scene. It appears here by itself; this page checks every 15 seconds.</p>
                <div className="mt-8 max-w-xl">
                  <SetupSteps current={1} compact />
                </div>
              </section>
            ) : (
              <ul aria-label="Scenes" className="mt-8 divide-y divide-rule overflow-hidden rounded-[var(--radius-card)] border border-rule bg-ink-1">
                {scenes.map((scene) => (
                  <SceneRow key={scene.sceneId} project={data} scene={scene} />
                ))}
              </ul>
            )}

            <ConnectionDialog project={data} open={connecting} onOpenChange={setConnecting} />
          </>
        )}
      </PageBody>
    </WorkspaceLayout>
  );
}

function SceneRow({ project, scene }: { project: ProjectDetail; scene: ProjectScene }) {
  return (
    <li>
      <Link to={`/projects/${project.id}/scenes/${encodeURIComponent(scene.sceneId)}`} className="group flex items-center gap-4 p-3 pr-4 transition-colors duration-[140ms] hover:bg-ink-3/60">
        <SnapshotImage hash={scene.latestHash} seed={scene.sceneId} className="h-[56px] w-[96px] shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] text-fg transition-colors group-hover:text-accent">{sceneTitle(scene)}</p>
          <p className="mt-0.5 truncate text-[13px] text-fg-3">
            {versionLabel(scene.currentVersion)} · {formatCaptured(scene.updatedAtUtc)} · {formatBytes(scene.sizeBytes)}
          </p>
        </div>
        {scene.processingStatus !== 'Ready' && (
          <span className="hidden sm:inline-flex">
            <VersionStatus status={scene.processingStatus} />
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-fg-3 transition-transform duration-[140ms] group-hover:translate-x-0.5 group-hover:text-fg" />
      </Link>
    </li>
  );
}
