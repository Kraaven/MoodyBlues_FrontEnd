import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, FolderKanban, Hourglass, KeyRound, Plus, XCircle } from 'lucide-react';
import { useCreateProject } from '../api/queries';
import { errorText } from '../api/client';
import { ViewShell, PageHeader } from '../shell/ViewShell';
import { useBrowseStage } from '../stage/browseStage';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, FormError } from '../ui/Field';
import { SnapshotImage } from '../ui/SnapshotImage';
import { EmptyState, ErrorState, SectionLabel, Skeleton } from '../ui/States';
import { formatAgo, formatDateTime, formatRecorded, plural, sceneTitle } from '../lib/format';
import { SetupSteps } from './ProjectPage';
import { ACTIVITY_PROJECTS, useRecentActivity, type ActivityItem } from './useRecentActivity';

const CARD = 'rounded-[var(--radius-card)] border border-rule bg-ink-1/85 backdrop-blur-sm';

export function ProjectsPage() {
  useBrowseStage();
  const { projects, details, now, attention } = useRecentActivity();
  const [creating, setCreating] = useState(false);
  const list = projects.data ?? [];

  return (
    <ViewShell crumbs={[{ label: 'Projects' }]}>
      <PageHeader
        title="Projects"
        meta={<span>One project per Unity game. Its page has the connection string for Unity.</span>}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            New project
          </Button>
        }
      />

      {projects.isError ? (
        <ErrorState error={projects.error} title="Projects did not load" onRetry={() => projects.refetch()} />
      ) : projects.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[210px] rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Create your first project" className="bg-ink-1/70 backdrop-blur-sm" action={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            New project
          </Button>
        }>
          <div className="mt-2 text-left">
            <SetupSteps connectionString={null} />
          </div>
        </EmptyState>
      ) : (
        <div className="space-y-10">
          {now.length > 0 && (
            <section className="space-y-3" aria-label="Recording now">
              <SectionLabel>Now</SectionLabel>
              <ul className="space-y-2">
                {now.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </ul>
            </section>
          )}

          {attention.length > 0 && (
            <section className="space-y-3" aria-label="Needs attention">
              <SectionLabel>Needs attention</SectionLabel>
              <ul className="space-y-2">
                {attention.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-3" aria-label="Your projects">
            <SectionLabel>Your projects</SectionLabel>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((project, i) => {
                const detail = details.get(project.id);
                const latest = detail ? [...detail.scenes].sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc))[0] : undefined;
                return (
                  <li key={project.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 20}ms` }}>
                    <Link
                      to={`/projects/${project.id}`}
                      className={`${CARD} group block overflow-hidden transition-[border-color,background-color] duration-[180ms] hover:border-blue/45 hover:bg-ink-2/90`}
                    >
                      <SnapshotImage hash={latest?.latestHash} seed={latest?.sceneId ?? project.id} className="aspect-video w-full rounded-none border-0 border-b border-rule" />
                      <div className="space-y-1.5 p-4">
                        <p className="truncate text-[15px] font-semibold text-fg">{project.name}</p>
                        <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-fg-2">
                          <span>{plural(project.sceneCount, 'scene')}</span>
                          <span className="text-fg-3">·</span>
                          <span className="text-fg-3">Created {formatDateTime(project.createdAtUtc)}</span>
                        </p>
                        {!project.ingestKeyPrefix && <p className="text-[13px] text-caution">No connection key</p>}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {list.length > ACTIVITY_PROJECTS && (
              <p className="text-[12px] text-fg-3">
                Recent activity covers your {ACTIVITY_PROJECTS} newest projects. Open any project to see its own sessions.
              </p>
            )}
          </section>
        </div>
      )}

      <CreateProjectDialog open={creating} onOpenChange={setCreating} />
    </ViewShell>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const { project, scene, session } = item;
  const sceneBase = scene ? `/projects/${project.id}/scenes/${encodeURIComponent(scene.sceneId)}` : `/projects/${project.id}`;
  const where = scene ? `${project.name} · ${sceneTitle(scene)}` : project.name;

  let to = sceneBase;
  let icon = <AlertTriangle className="h-4 w-4 text-caution" />;
  let label = '';
  let detail: string | null = null;
  switch (item.kind) {
    case 'recording':
      to = `${sceneBase}/sessions/${encodeURIComponent(session!.id)}`;
      icon = <span className="h-2.5 w-2.5 animate-pulse-live rounded-full bg-live" />;
      label = 'Recording';
      detail = `Started ${formatAgo(session!.createdAtUtc)}`;
      break;
    case 'failed':
      to = `${sceneBase}/sessions/${encodeURIComponent(session!.id)}`;
      icon = <XCircle className="h-4 w-4 text-danger" />;
      label = 'Failed';
      detail = `${formatRecorded(session!.createdAtUtc)}${session!.errorMessage ? ` · ${session!.errorMessage}` : ''}`;
      break;
    case 'waiting':
      icon = <Hourglass className="h-4 w-4 text-wait" />;
      label = 'Waiting for scene';
      detail = `${plural(item.count ?? 0, 'session')} recorded in a version that has not been uploaded`;
      break;
    case 'no-key':
      to = `/projects/${project.id}`;
      icon = <KeyRound className="h-4 w-4 text-caution" />;
      label = 'No connection key';
      detail = 'Recordings from Unity are refused until one is created';
      break;
    case 'optimize-failed':
      label = 'Scene optimization failed';
      detail = 'Replays use the unoptimized upload';
      break;
  }

  return (
    <li>
      <Link
        to={to}
        className={`${CARD} group flex items-start gap-3 px-4 py-3 transition-colors duration-[120ms] hover:border-rule-strong hover:bg-ink-2/90`}
      >
        <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] text-fg">
            <span className="font-semibold">{label}</span>
            <span className="text-fg-3"> · </span>
            <span className="text-fg-2">{item.kind === 'no-key' ? project.name : where}</span>
          </p>
          {detail && <p className="mt-0.5 truncate text-[12px] text-fg-3">{detail}</p>}
        </div>
      </Link>
    </li>
  );
}

function CreateProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState('');
  const create = useCreateProject();
  const navigate = useNavigate();

  // The project page shows the connection string and the setup steps.
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const project = await create.mutateAsync(name.trim()).catch(() => null);
    if (project) {
      setName('');
      onOpenChange(false);
      navigate(`/projects/${project.id}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New project" description="Usually named after the Unity game it records.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Project name" required autoFocus maxLength={200} value={name} onChange={(e) => setName(e.target.value)} placeholder="My Game" />
        <FormError>{create.isError ? errorText(create.error) : null}</FormError>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
            Create project
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
