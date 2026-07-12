import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Plus } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Modal } from '../components/Modal';
import { CopyableId } from '../components/CopyableId';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Chip } from '../components/ui/Chip';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { Input, Label, FieldError } from '../components/ui/Input';
import { api, ApiError } from '../lib/api';
import type { ProjectSummary } from '../lib/types';

export function DashboardPage() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadProjects = () => {
    api
      .get<ProjectSummary[]>('/api/projects')
      .then(setProjects)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load projects.'));
  };

  useEffect(() => {
    loadProjects();
  }, []);

  return (
    <div className="min-h-screen bg-canvas">
      <Navbar />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <PageHeader
          eyebrow="Projects"
          title="Your projects"
          description="Each project has a Developer ID -- paste it into your Unity client's config to start uploading scenes to it."
          actions={
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus className="h-4 w-4" />
              New project
            </Button>
          }
        />

        {error && <FieldError>{error}</FieldError>}

        {projects === null && !error && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[124px] animate-pulse rounded-2xl border border-hairline bg-surface" />
            ))}
          </div>
        )}

        {projects?.length === 0 && (
          <EmptyState
            icon={Boxes}
            title="No projects yet"
            description="Create one to get a Developer ID you can paste into your Unity client."
            action={
              <Button variant="secondary" onClick={() => setIsModalOpen(true)}>
                <Plus className="h-4 w-4" />
                New project
              </Button>
            }
          />
        )}

        {projects && projects.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Link key={project.id} to={`/projects/${project.id}`}>
                <Card interactive className="p-5">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <h2 className="truncate text-[15px] font-medium text-ink">{project.name}</h2>
                    <Chip mono tone="neutral">
                      {project.sceneCount} scene{project.sceneCount === 1 ? '' : 's'}
                    </Chip>
                  </div>
                  <div onClick={(e) => e.preventDefault()}>
                    <CopyableId value={project.developerId} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>

      {isModalOpen && (
        <CreateProjectModal
          onClose={() => setIsModalOpen(false)}
          onCreated={() => {
            setIsModalOpen(false);
            loadProjects();
          }}
        />
      )}
    </div>
  );
}

function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post('/api/projects', { name });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create project.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title="New project" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <Label htmlFor="project-name">Project name</Label>
          <Input
            id="project-name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Game"
          />
        </div>

        {error && <FieldError>{error}</FieldError>}

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Creating...' : 'Create project'}
        </Button>
      </form>
    </Modal>
  );
}
