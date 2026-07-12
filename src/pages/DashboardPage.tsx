import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FolderKanban, Plus } from 'lucide-react';
import { Navbar } from '../components/Navbar';
import { Modal } from '../components/Modal';
import { CopyableId } from '../components/CopyableId';
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
    <div className="min-h-screen bg-[#0b0b0f]">
      <Navbar />

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">Your projects</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Each project has a Developer ID -- paste it into your Unity client's config to upload scenes to it.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {projects === null && !error && <p className="text-sm text-zinc-500">Loading projects...</p>}

        {projects?.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
            <FolderKanban className="mx-auto mb-3 h-8 w-8 text-zinc-600" />
            <p className="text-zinc-400">No projects yet. Create one to get a Developer ID.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects?.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="group rounded-xl border border-white/10 bg-[#131317] p-5 transition hover:border-violet-400/40"
            >
              <h2 className="truncate font-medium text-white group-hover:text-violet-300">{project.name}</h2>
              <p className="mt-1 text-xs text-zinc-500">
                {project.sceneCount} scene{project.sceneCount === 1 ? '' : 's'}
              </p>
              <div className="mt-4" onClick={(e) => e.preventDefault()}>
                <CopyableId value={project.developerId} />
              </div>
            </Link>
          ))}
        </div>
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
    <Modal title="New Project" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm text-zinc-300" htmlFor="project-name">
            Project name
          </label>
          <input
            id="project-name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60"
            placeholder="My Game"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400 disabled:opacity-50"
        >
          {isSubmitting ? 'Creating...' : 'Create project'}
        </button>
      </form>
    </Modal>
  );
}
