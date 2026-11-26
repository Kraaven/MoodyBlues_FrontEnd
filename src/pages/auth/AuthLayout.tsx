import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { DEMO_POSE } from '../../stage/DemoScene';
import { StageWindow } from '../../stage/StageWindow';
import { idleView, type StageView } from '../../stage/store';
import { useStageView } from '../../stage/useStageView';
import { Brand } from '../../ui/Logo';

const DEMO: StageView = { id: 'auth', content: 'demo', pose: DEMO_POSE, drift: true, dim: 1, durationMs: 0 };

/** The shell every signed-out page shares: the form column on the left, the product's own scene on the right. */
export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  const wide = useMediaQuery('(min-width: 1024px)');
  useStageView(wide ? DEMO : idleView('auth'));

  useEffect(() => {
    document.title = `${title} · MoodyBlues`;
  }, [title]);

  return (
    <div className="relative isolate flex min-h-dvh">
      <main id="main" className="flex w-full flex-col px-6 py-8 sm:px-12 lg:w-[40%] lg:min-w-[480px] lg:max-w-[640px] lg:px-14 lg:py-10">
        <Link to="/login" aria-label="MoodyBlues" className="w-fit">
          <Brand />
        </Link>

        <div className="flex flex-1 items-center py-12">
          <div className="w-full max-w-[400px] animate-rise lg:ml-10">{children}</div>
        </div>
      </main>

      {wide && (
        <section aria-label="A recorded scene" className="relative flex-1 py-6 pr-6">
          <StageWindow interactive={false} className="h-full rounded-[18px]" contentClassName="flex flex-col justify-end">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-t from-world-0 via-world-0/40 via-25% to-transparent to-50%" />
            <p className="display relative px-12 pb-12 text-[34px] leading-10 text-fg xl:px-14">Hindsight, in three dimensions.</p>
          </StageWindow>
        </section>
      )}
    </div>
  );
}
