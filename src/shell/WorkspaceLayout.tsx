import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Dialog as D } from 'radix-ui';
import { ArrowRight, Folder, FolderOpen, LayoutGrid, Plus, X } from 'lucide-react';
import { useProjects } from '../api/queries';
import { useAuth } from '../auth/useAuth';
import { useRecentActivity } from '../pages/useRecentActivity';
import { cn } from '../ui/cn';
import { Skeleton } from '../ui/States';
import { useSetupGuide } from './SetupGuide';
import { TopBar } from './TopBar';

function Sidebar({ live }: { live: number }) {
  const { user } = useAuth();
  const projects = useProjects();
  const showGuide = useSetupGuide((s) => s.show);
  const list = [...(projects.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const workspace = user?.email.split('@')[0] ?? '';

  return (
    <div className="flex h-full flex-col px-4 py-6">
      <div className="px-2.5">
        <p className="eyebrow truncate">{workspace ? `${workspace}'s workspace` : 'Workspace'}</p>
      </div>

      <NavLink
        to="/projects"
        end
        className={({ isActive }) =>
          cn(
            'mt-6 flex h-11 items-center gap-3 rounded-[var(--radius-control)] px-2.5 text-[15px] transition-colors duration-[140ms]',
            isActive ? 'bg-accent/14 text-accent' : 'text-fg-2 hover:bg-ink-3 hover:text-fg',
          )
        }
      >
        <LayoutGrid className="h-[18px] w-[18px]" strokeWidth={1.6} />
        Overview
      </NavLink>

      <div className="mt-8 flex items-center justify-between px-2.5">
        <p className="eyebrow">Projects</p>
        <Link to="/projects/new" aria-label="New project" className="-mr-1.5 flex h-7 w-7 items-center justify-center rounded-[var(--radius-control)] text-fg-2 transition-colors hover:bg-ink-3 hover:text-fg">
          <Plus className="h-[18px] w-[18px]" strokeWidth={1.6} />
        </Link>
      </div>
      <nav aria-label="Projects" className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto">
        {projects.isPending
          ? [0, 1].map((i) => <Skeleton key={i} className="h-11" />)
          : list.map((p) => (
              <NavLink
                key={p.id}
                to={`/projects/${p.id}`}
                className={({ isActive }) =>
                  cn(
                    'group flex h-11 items-center gap-3 rounded-[var(--radius-control)] px-2.5 text-[15px] transition-colors duration-[140ms]',
                    isActive ? 'bg-accent/14 text-accent' : 'text-fg-2 hover:bg-ink-3 hover:text-fg',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? <FolderOpen className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} /> : <Folder className="h-[18px] w-[18px] shrink-0" strokeWidth={1.6} />}
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    {!p.ingestKeyPrefix && <span aria-label="No connection key" title="No connection key" className="h-1.5 w-1.5 rounded-full bg-caution" />}
                  </>
                )}
              </NavLink>
            ))}
        {projects.data?.length === 0 && <p className="px-2.5 text-[13px] text-fg-3">No projects yet.</p>}
      </nav>

      <div className="mt-6 border-t border-rule pt-6">
        <p className="px-0.5 text-[14px] text-fg">Need a hand?</p>
        <button type="button" onClick={() => showGuide()} className="group mt-1 flex w-full items-center justify-between px-0.5 text-left text-[13px] text-fg-2 hover:text-fg">
          Read the Unity quickstart
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </button>
        <p className={cn('eyebrow mt-6 flex items-center gap-2 px-0.5', live > 0 && 'text-live')}>
          {live > 0 && <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-live" />}
          {live > 0 ? `${live} recording now` : 'No live sessions'}
        </p>
      </div>
    </div>
  );
}

/**
 * The frame of the browse pages: the top bar, the project sidebar, and a main column. The main
 * column is its own stacking context so a StageWindow inside it can paint the page colour around
 * itself without covering the bar or the sidebar.
 */
export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  const activity = useRecentActivity();
  const live = activity.now.length;

  useEffect(() => setDrawer(false), [location.pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar live={live > 0} onMenu={() => setDrawer(true)} />
      <div className="flex min-h-0 flex-1">
        <aside className="sticky top-[72px] z-20 hidden h-[calc(100dvh-72px)] w-[248px] shrink-0 border-r border-rule bg-ink-2 lg:block">
          <Sidebar live={live} />
        </aside>
        <main id="main" className="relative isolate min-w-0 flex-1">
          {children}
        </main>
      </div>

      <D.Root open={drawer} onOpenChange={setDrawer}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-[60] animate-fade bg-black/60 lg:hidden" />
          <D.Content className="fixed inset-y-0 left-0 z-[61] w-[280px] animate-[drawer-in_260ms_var(--ease-out-soft)] border-r border-rule bg-ink-2 focus:outline-none lg:hidden">
            <D.Title className="sr-only">Projects</D.Title>
            <D.Description className="sr-only">Your projects</D.Description>
            <D.Close aria-label="Close" className="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)] text-fg-3 hover:text-fg">
              <X className="h-5 w-5" />
            </D.Close>
            <Sidebar live={live} />
          </D.Content>
        </D.Portal>
      </D.Root>
    </div>
  );
}

/** The padded content column inside a layout. */
export function PageBody({ children, className, width = 'wide' }: { children: ReactNode; className?: string; width?: 'wide' | 'narrow' }) {
  return <div className={cn('mx-auto w-full px-5 pb-20 pt-10 sm:px-8 lg:px-11 lg:pt-12', width === 'wide' ? 'max-w-[1360px]' : 'max-w-[1240px]', className)}>{children}</div>;
}
