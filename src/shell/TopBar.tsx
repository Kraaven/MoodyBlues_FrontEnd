import { Fragment } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, LogOut, Plus, UserRound } from 'lucide-react';
import { useProjects } from '../api/queries';
import { useAuth } from '../auth/useAuth';
import { Mark, Wordmark } from '../ui/Logo';
import { IconButton } from '../ui/Button';
import { Menu } from '../ui/Menu';
import { cn } from '../ui/cn';

export interface Crumb {
  label: string;
  /** Where this crumb goes. The last crumb has none. */
  to?: string;
  /** Show the list of projects under this crumb, to jump between them. */
  switcher?: boolean;
}

export function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <Menu
      header={
        <>
          Signed in as
          <span className="mt-0.5 block truncate text-[13px] text-fg">{user?.email}</span>
        </>
      }
      trigger={
        <IconButton label="Account" tooltip={false}>
          <UserRound className="h-5 w-5" strokeWidth={1.6} />
        </IconButton>
      }
      items={[
        {
          label: 'Sign out',
          icon: LogOut,
          onSelect: () => {
            void logout().then(() => navigate('/login'));
          },
        },
      ]}
    />
  );
}

function ProjectSwitcher({ label }: { label: string }) {
  const projects = useProjects();
  const navigate = useNavigate();
  const list = [...(projects.data ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Menu
      align="start"
      trigger={
        <button type="button" className="inline-flex h-8 min-w-0 max-w-[220px] items-center gap-1.5 rounded-[var(--radius-control)] px-2 text-[14px] text-fg transition-colors hover:bg-ink-3" aria-label={`${label}. Switch project`}>
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-3" />
        </button>
      }
      items={[
        ...list.map((p) => ({ label: p.name, onSelect: () => navigate(`/projects/${p.id}`) })),
        { label: 'New project', icon: Plus, separated: list.length > 0, onSelect: () => navigate('/projects/new') },
      ]}
    />
  );
}

/**
 * The bar across the top of every page that is not the 3D studio: the mark, where you are, whether
 * anything is recording, and the account. Where you are is the only navigation; the project crumb
 * doubles as the project switcher.
 */
export function TopBar({ crumbs = [], live, liveHref, className }: { crumbs?: Crumb[]; live?: boolean; liveHref?: string; className?: string }) {
  return (
    <header className={cn('sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-rule bg-ink-2/95 px-4 backdrop-blur-md sm:px-6', className)}>
      <Link to="/projects" aria-label="MoodyBlues home" className="flex shrink-0 items-center gap-2.5">
        <Mark className="text-[24px]" live={live} />
        <Wordmark className="max-sm:hidden" />
      </Link>

      <nav aria-label="Breadcrumb" className="ml-2 flex min-w-0 flex-1 items-center gap-1 text-[14px]">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={`${i}-${crumb.label}`}>
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-fg-3" />
              {crumb.switcher ? (
                <ProjectSwitcher label={crumb.label} />
              ) : crumb.to && !last ? (
                <Link to={crumb.to} className="max-w-[220px] truncate rounded-[var(--radius-control)] px-2 py-1 text-fg-2 transition-colors hover:text-fg max-sm:hidden">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={cn('min-w-0 truncate px-2 py-1', last ? 'text-fg' : 'text-fg-2')}>
                  {crumb.label}
                </span>
              )}
            </Fragment>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        {live && liveHref && (
          <Link
            to={liveHref}
            className="inline-flex h-8 items-center gap-2 rounded-full border border-live/40 bg-live/10 px-3 text-[13px] text-live transition-colors hover:bg-live/20"
          >
            <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-live" />
            Recording
          </Link>
        )}
        <AccountMenu />
      </div>
    </header>
  );
}
