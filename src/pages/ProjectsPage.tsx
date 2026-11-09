import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FolderKanban, Plus } from 'lucide-react';
import { useCreateProject, useProjects } from '../api/queries';
import { errorText } from '../api/client';
import { AppShell, PageHeader } from '../shell/AppShell';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, FormError } from '../ui/Field';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';
import { formatDateTime, plural } from '../lib/format';
import { SetupSteps } from './ProjectPage';

export function ProjectsPage() {
  const projects = useProjects();
  const [creating, setCreating] = useState(false);

  return (
    <AppShell crumbs={[{ label: 'Projects' }]}>
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
            <Skeleton key={i} className="h-[148px] rounded-[var(--radius-card)]" />
          ))}
        </div>
      ) : projects.data.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Create your first project"
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              New project
            </Button>
          }
        >
          <div className="mt-2 text-left">
            <SetupSteps connectionString={null} />
          </div>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.data.map((project, i) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              style={{ animationDelay: `${Math.min(i, 8) * 20}ms` }}
              className="group flex animate-rise flex-col justify-between gap-6 rounded-[var(--radius-card)] border border-rule bg-ink-1 p-5 transition-[border-color,background-color] duration-[180ms] hover:border-blue/40 hover:bg-ink-2"
            >
              <div className="space-y-1">
                <p className="truncate text-[16px] font-semibold text-fg">{project.name}</p>
                <p className="text-[13px] text-fg-2">{plural(project.sceneCount, 'scene')}</p>
              </div>
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-fg-3">Created {formatDateTime(project.createdAtUtc)}</span>
                {!project.ingestKeyPrefix && <span className="text-caution">No connection key</span>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateProjectDialog open={creating} onOpenChange={setCreating} />
    </AppShell>
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
