import { Link } from 'react-router-dom';
import { Hourglass, KeyRound, Plus, TriangleAlert, XCircle } from 'lucide-react';
import { PageBody, PageHeader, WorkspaceLayout } from '../shell/WorkspaceLayout';
import type { StageView } from '../stage/store';
import { useStageView } from '../stage/useStageView';
import { LinkButton } from '../ui/Button';
import { SnapshotImage } from '../ui/SnapshotImage';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import { formatAgo, formatCaptured, plural, sceneTitle } from '../lib/format';
import { useWindowTitle } from '../lib/useWindowTitle';
import { ACTIVITY_PROJECTS, useRecentActivity, type ActivityItem } from './useRecentActivity';

const NONE: StageView = { id: 'lobby', content: 'none', dim: 0 };

/**
 * The page you land on: your projects, with anything that is recording or broken above them.
 */
export function LobbyPage() {
  useStageView(NONE);
  useWindowTitle('Projects');
  const { projects, details, now, attention } = useRecentActivity();
  const list = [...(projects.data ?? [])].sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc));
  const activity = [...now, ...attention];

  return (
    <WorkspaceLayout crumbs={[{ label: 'Projects' }]}>
      <PageBody>
        <PageHeader
          title="Projects"
          meta={projects.data ? plural(list.length, 'project') : undefined}
          actions={
            list.length > 0 && (
              <LinkButton to="/projects/new">
                <Plus className="h-4 w-4" />
                New project
              </LinkButton>
            )
          }
        />

        {projects.isError ? (
          <ErrorState className="mt-10" error={projects.error} title="Projects did not load" onRetry={() => projects.refetch()} />
        ) : projects.isPending ? (
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[248px] rounded-[var(--radius-card)]" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            className="mt-10"
            title="No projects yet"
            action={
              <LinkButton to="/projects/new">
                <Plus className="h-4 w-4" />
                Create a project
              </LinkButton>
            }
          >
            A project holds the scenes and recordings of one Unity game. Create it first, then paste its connection string into Unity.
          </EmptyState>
        ) : (
          <>
            {activity.length > 0 && (
              <section aria-label="Needs a look" className="mt-10">
                <ul className="divide-y divide-rule overflow-hidden rounded-[var(--radius-card)] border border-rule bg-ink-1">
                  {activity.slice(0, 6).map((item) => (
                    <ActivityRow key={item.id} item={item} />
                  ))}
                </ul>
                {list.length > ACTIVITY_PROJECTS && <p className="mt-2 text-[12px] text-fg-3">Checked for your {ACTIVITY_PROJECTS} newest projects.</p>}
              </section>
            )}

            <ul aria-label="Projects" className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((project) => {
                const detail = details.get(project.id);
                const latest = detail ? [...detail.scenes].sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc))[0] : undefined;
                return (
                  <li key={project.id}>
                    <Link
                      to={`/projects/${project.id}`}
                      className="group block overflow-hidden rounded-[var(--radius-card)] border border-rule bg-ink-1 transition-colors duration-[180ms] hover:border-rule-strong"
                    >
                      <SnapshotImage hash={latest?.latestHash} seed={latest?.sceneId ?? project.id} className="aspect-[16/10] w-full rounded-none" />
                      <div className="space-y-1 border-t border-rule p-4">
                        <p className="truncate text-[16px] font-medium text-fg transition-colors group-hover:text-accent">{project.name}</p>
                        <p className="truncate text-[13px] text-fg-3">
                          {plural(project.sceneCount, 'scene')}
                          {latest && <> · {sceneTitle(latest)}</>}
                        </p>
                        {!project.ingestKeyPrefix && (
                          <p className="flex items-center gap-1.5 pt-1 text-[13px] text-caution">
                            <KeyRound className="h-3.5 w-3.5" />
                            No connection key
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </PageBody>
    </WorkspaceLayout>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const { project, scene, session } = item;
  const sceneBase = scene ? `/projects/${project.id}/scenes/${encodeURIComponent(scene.sceneId)}` : `/projects/${project.id}`;
  const where = scene ? `${project.name} / ${sceneTitle(scene)}` : project.name;

  let to = sceneBase;
  let icon = <TriangleAlert className="h-4 w-4 text-caution" />;
  let label = '';
  let detail: string | null = null;
  switch (item.kind) {
    case 'recording':
      to = `${sceneBase}/sessions/${encodeURIComponent(session!.id)}`;
      icon = <span className="h-2 w-2 animate-pulse-live rounded-full bg-live" />;
      label = 'Recording';
      detail = `Started ${formatAgo(session!.createdAtUtc)}`;
      break;
    case 'failed':
      to = `${sceneBase}/sessions/${encodeURIComponent(session!.id)}`;
      icon = <XCircle className="h-4 w-4 text-danger" />;
      label = 'Replay failed';
      detail = `${formatCaptured(session!.createdAtUtc)}${session!.errorMessage ? ` · ${session!.errorMessage}` : ''}`;
      break;
    case 'waiting':
      icon = <Hourglass className="h-4 w-4 text-wait" />;
      label = 'Waiting for scene';
      detail = `${plural(item.count ?? 0, 'session')} recorded in a version that was never uploaded`;
      break;
    case 'no-key':
      to = `/projects/${project.id}`;
      icon = <KeyRound className="h-4 w-4 text-caution" />;
      label = 'No connection key';
      detail = 'Unity recordings are refused until it has one';
      break;
    case 'optimize-failed':
      label = 'Scene not optimized';
      detail = 'Replays use the unoptimized upload';
      break;
  }

  return (
    <li>
      <Link to={to} className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-[140ms] hover:bg-ink-3/60">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
        <p className="min-w-0 flex-1 truncate text-[14px] text-fg">
          {label}
          <span className="text-fg-3"> · </span>
          <span className="text-fg-2">{item.kind === 'no-key' ? project.name : where}</span>
        </p>
        {detail && <p className="hidden min-w-0 max-w-[45%] truncate text-[13px] text-fg-3 md:block">{detail}</p>}
      </Link>
    </li>
  );
}
