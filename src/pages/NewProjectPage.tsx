import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateProject } from '../api/queries';
import { errorText } from '../api/client';
import { PageBody, PageHeader, WorkspaceLayout } from '../shell/WorkspaceLayout';
import type { StageView } from '../stage/store';
import { useStageView } from '../stage/useStageView';
import { Button, LinkButton } from '../ui/Button';
import { Field, FormError } from '../ui/Field';
import { useWindowTitle } from '../lib/useWindowTitle';

const NONE: StageView = { id: 'new-project', content: 'none', dim: 0 };

export function NewProjectPage() {
  useStageView(NONE);
  useWindowTitle('New project');
  const [name, setName] = useState('');
  const create = useCreateProject();
  const navigate = useNavigate();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const project = await create.mutateAsync(name.trim()).catch(() => null);
    // The project page opens on its Unity connection: the one thing to do next.
    if (project) navigate(`/projects/${project.id}?connect=1`, { replace: true });
  };

  return (
    <WorkspaceLayout crumbs={[{ label: 'Projects', to: '/projects' }, { label: 'New project' }]}>
      <PageBody width="narrow">
        <PageHeader title="New project" meta="One project per Unity game. It holds every scene and recording." />
        <form onSubmit={onSubmit} className="mt-10 space-y-8">
          <Field
            label="Project name"
            required
            autoFocus
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Aperture"
            hint="Usually the name of the Unity game."
          />
          <FormError>{create.isError ? errorText(create.error) : null}</FormError>
          <div className="flex items-center gap-2">
            <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
              Create project
            </Button>
            <LinkButton to="/projects" variant="ghost">
              Cancel
            </LinkButton>
          </div>
        </form>
      </PageBody>
    </WorkspaceLayout>
  );
}
