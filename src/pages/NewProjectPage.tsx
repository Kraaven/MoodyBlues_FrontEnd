import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useCreateProject } from '../api/queries';
import { errorText } from '../api/client';
import { SetupSteps } from '../shell/SetupGuide';
import { TopBar } from '../shell/TopBar';
import type { StageView } from '../stage/store';
import { useStageView } from '../stage/useStageView';
import { Button } from '../ui/Button';
import { Field, FormError } from '../ui/Field';
import { Overline } from '../ui/States';
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
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main id="main" className="relative isolate flex-1">
        <div className="mx-auto w-full max-w-[1320px] px-5 pb-20 pt-10 sm:px-10 lg:px-[120px] lg:pt-14">
          <Link to="/projects" className="inline-flex items-center gap-1.5 text-[14px] text-fg-2 transition-colors hover:text-fg">
            <ArrowLeft className="h-4 w-4" />
            Back to projects
          </Link>

          <div className="mt-16 grid gap-16 lg:grid-cols-[1fr_520px] lg:gap-24">
            <form onSubmit={onSubmit} className="animate-rise">
              <Overline accent>01 / Create a project</Overline>
              <h1 className="display mt-8 text-[46px] leading-[54px] text-fg sm:text-[60px] sm:leading-[72px]">
                Give your sessions
                <br />a place to live.
              </h1>
              <p className="mt-4 text-[17px] text-fg-2">One project for your game. Every scene and session, together.</p>

              <div className="mt-14 max-w-[620px] space-y-10">
                <Field
                  label="Project name"
                  required
                  autoFocus
                  maxLength={200}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Aperture"
                  hint="Usually the name of the Unity game. You can have one project per game."
                />
                <FormError>{create.isError ? errorText(create.error) : null}</FormError>
                <Button type="submit" size="lg" className="w-full" loading={create.isPending} disabled={!name.trim()} trailing={<ArrowRight className="h-5 w-5" />}>
                  Create project
                </Button>
              </div>
            </form>

            <aside className="h-fit animate-rise rounded-[var(--radius-card)] border border-rule bg-ink-1 p-9 [animation-delay:80ms]">
              <Overline accent>From play to playback</Overline>
              <p className="display mt-9 text-[30px] leading-[40px] text-fg">
                A little setup.
                <br />A whole new perspective.
              </p>
              <div className="mt-12">
                <SetupSteps current={0} />
              </div>
              <p className="mt-12 border-t border-rule pt-7 text-[14px] text-fg-2">Your recordings stay private to your account.</p>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
