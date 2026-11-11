import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Hourglass, KeyRound, Plus, TriangleAlert, XCircle } from 'lucide-react';
import { PageBody, WorkspaceLayout } from '../shell/WorkspaceLayout';
import { SetupSteps } from '../shell/SetupGuide';
import type { StageView } from '../stage/store';
import { useStageView } from '../stage/useStageView';
import { LinkButton } from '../ui/Button';
import { SnapshotImage } from '../ui/SnapshotImage';
import { ErrorState, Overline, Skeleton } from '../ui/States';
import { formatAgo, formatCaptured, plural, sceneTitle } from '../lib/format';
import { useWindowTitle } from '../lib/useWindowTitle';
import { ACTIVITY_PROJECTS, useRecentActivity, type ActivityItem } from './useRecentActivity';

const NONE: StageView = { id: 'lobby', content: 'none', dim: 0 };

/**
 * The page you land on: the state of your work. What is recording now, what needs attention, and
 * every project with a picture of its latest scene.
 */
export function LobbyPage() {
  useStageView(NONE);
  useWindowTitle('Workspace');
  const { projects, details, now, attention } = useRecentActivity();
  const list = [...(projects.data ?? [])].sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc));

  return (
    <WorkspaceLayout>
      <PageBody>
        <header className="flex flex-wrap items-end justify-between gap-6">
          <div className="animate-rise">
            <Overline>Workspace / overview</Overline>
            <h1 className="display mt-5 text-[48px] leading-[54px] text-fg sm:text-[60px] sm:leading-[66px]">Your projects</h1>
            <p className="mt-3 text-[16px] text-fg-2">Every scene and every session your team has recorded.</p>
          </div>
          <LinkButton to="/projects/new" className="min-w-[180px] justify-start">
            <Plus className="h-4 w-4" />
            New project
          </LinkButton>
        </header>

        {projects.isError ? (
          <ErrorState className="mt-12" error={projects.error} title="Projects did not load" onRetry={() => projects.refetch()} />
        ) : projects.isPending ? (
          <div className="mt-14 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[300px] rounded-[var(--radius-card)]" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <FirstRun />
        ) : (
          <>
            {(now.length > 0 || attention.length > 0) && (
              <section aria-label="Recent activity" className="mt-14 grid items-start gap-5 lg:grid-cols-2">
                <ActivityColumn title="Now" empty="Nothing is recording." items={now} live />
                <ActivityColumn title="Needs attention" empty="Nothing needs you." items={attention} />
                {list.length > ACTIVITY_PROJECTS && (
                  <p className="text-[12px] text-fg-3 lg:col-span-2">Recent activity covers your {ACTIVITY_PROJECTS} newest projects and their latest scene.</p>
                )}
              </section>
            )}

            <section aria-label="Projects" className="mt-14">
              <div className="flex items-baseline gap-3 border-b border-rule pb-4">
                <h2 className="text-[17px] text-fg">Projects</h2>
                <span className="tabular font-mono text-[11px] text-accent">{String(list.length).padStart(2, '0')}</span>
              </div>
              <ul className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((project, i) => {
                  const detail = details.get(project.id);
                  const latest = detail ? [...detail.scenes].sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc))[0] : undefined;
                  return (
                    <li key={project.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                      <Link
                        to={`/projects/${project.id}`}
                        className="group block overflow-hidden rounded-[var(--radius-card)] border border-rule bg-ink-1 transition-[border-color,transform] duration-[220ms] hover:-translate-y-0.5 hover:border-rule-strong"
                      >
                        <SnapshotImage hash={latest?.latestHash} seed={latest?.sceneId ?? project.id} className="aspect-[16/10] w-full rounded-none transition-transform duration-[600ms] ease-[var(--ease-out-soft)] group-hover:scale-[1.015]" />
                        <div className="relative space-y-2 border-t border-rule bg-ink-1 p-5">
                          <div className="flex items-center justify-between gap-3">
                            <p className="display truncate text-[22px] leading-7 text-fg">{project.name}</p>
                            <ArrowUpRight className="h-5 w-5 shrink-0 text-fg-3 transition-colors group-hover:text-accent" />
                          </div>
                          <p className="font-mono text-[12px] text-fg-3">
                            {plural(project.sceneCount, 'scene')}
                            {latest && <> · {sceneTitle(latest)}</>}
                          </p>
                          {!project.ingestKeyPrefix && (
                            <p className="flex items-center gap-1.5 text-[13px] text-caution">
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
            </section>
          </>
        )}
      </PageBody>
    </WorkspaceLayout>
  );
}

function FirstRun() {
  return (
    <section className="mt-14 grid gap-10 rounded-[var(--radius-card)] border border-rule bg-ink-1 p-8 lg:grid-cols-[1.1fr_1fr] lg:p-12">
      <div>
        <Overline accent>01 / Get started</Overline>
        <p className="display mt-6 text-[36px] leading-[42px] text-fg">
          Give your sessions
          <br />a place to live.
        </p>
        <p className="mt-4 max-w-md text-[15px] text-fg-2">Create a project for your Unity game. It gives you the connection string that Unity needs, once.</p>
        <LinkButton to="/projects/new" size="lg" className="mt-10 min-w-[260px]" trailing={<ArrowRight className="h-5 w-5" />}>
          Create your first project
        </LinkButton>
      </div>
      <div className="border-rule lg:border-l lg:pl-12">
        <SetupSteps current={0} />
      </div>
    </section>
  );
}

function ActivityColumn({ title, empty, items, live = false }: { title: string; empty: string; items: ActivityItem[]; live?: boolean }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-rule bg-ink-1">
      <div className="flex items-center justify-between border-b border-rule px-5 py-4">
        <p className="eyebrow flex items-center gap-2">
          {live && items.length > 0 && <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-live" />}
          {title}
        </p>
        <span className="tabular font-mono text-[11px] text-fg-3">{String(items.length).padStart(2, '0')}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-5 text-[14px] text-fg-3">{empty}</p>
      ) : (
        <ul className="divide-y divide-rule">
          {items.slice(0, 6).map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
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
      <Link to={to} className="group flex items-center gap-4 px-5 py-3.5 transition-colors duration-[140ms] hover:bg-ink-3/60">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] text-fg">
            {label}
            <span className="text-fg-3"> · </span>
            <span className="text-fg-2">{item.kind === 'no-key' ? project.name : where}</span>
          </p>
          {detail && <p className="truncate font-mono text-[12px] text-fg-3">{detail}</p>}
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-fg-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </Link>
    </li>
  );
}
