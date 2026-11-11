import type { ReactNode } from 'react';
import { useRecentActivity } from '../pages/useRecentActivity';
import { cn } from '../ui/cn';
import { TopBar, type Crumb } from './TopBar';

/**
 * The frame of every browse page: one slim top bar and a main column. There is no sidebar; the
 * breadcrumb in the bar is the navigation and its project crumb switches projects.
 */
export function WorkspaceLayout({ children, crumbs }: { children: ReactNode; crumbs?: Crumb[] }) {
  const { now } = useRecentActivity();
  const first = now[0];
  const liveHref =
    first?.session && first.scene
      ? `/projects/${first.project.id}/scenes/${encodeURIComponent(first.scene.sceneId)}/sessions/${encodeURIComponent(first.session.id)}`
      : undefined;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar crumbs={crumbs} live={now.length > 0} liveHref={liveHref} />
      <main id="main" className="relative isolate min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}

/** The padded content column inside a layout. */
export function PageBody({ children, className, width = 'wide' }: { children: ReactNode; className?: string; width?: 'wide' | 'narrow' }) {
  return <div className={cn('mx-auto w-full px-5 pb-20 pt-8 sm:px-8 lg:pt-10', width === 'wide' ? 'max-w-[1120px]' : 'max-w-[640px]', className)}>{children}</div>;
}

/** A page title with one line of meta under it, and the page's actions on the right. */
export function PageHeader({ title, meta, actions }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 max-w-full">
        <h1 className="display truncate text-[30px] leading-9 text-fg sm:text-[34px] sm:leading-10">{title}</h1>
        {meta && <p className="mt-1.5 text-[14px] text-fg-2">{meta}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
