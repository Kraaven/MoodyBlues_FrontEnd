import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { Logo, Wordmark } from '../ui/Logo';
import { Menu } from '../ui/Menu';
import { Tooltip } from '../ui/Tooltip';
import { cn } from '../ui/cn';

export interface Crumb {
  label: string;
  to?: string;
}

/** Truncates the middle of long names so both ends stay recognisable. */
function middleTruncate(text: string, max = 32): string {
  if (text.length <= max) return text;
  const keep = Math.floor((max - 1) / 2);
  return `${text.slice(0, keep)}…${text.slice(text.length - keep)}`;
}

function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        const label = middleTruncate(crumb.label);
        const content =
          crumb.to && !last ? (
            <Link to={crumb.to} className="rounded px-1.5 py-1 text-fg-2 transition-colors hover:text-fg">
              {label}
            </Link>
          ) : (
            <span aria-current={last ? 'page' : undefined} className={cn('px-1.5 py-1', last ? 'font-medium text-fg' : 'text-fg-2')}>
              {label}
            </span>
          );
        return (
          <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-3" aria-hidden="true" />}
            {label !== crumb.label ? <Tooltip content={crumb.label}>{content}</Tooltip> : content}
          </span>
        );
      })}
    </nav>
  );
}

function AccountMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <Menu
      trigger={
        <button
          type="button"
          className="flex h-8 items-center gap-2 rounded-[var(--radius-control)] px-2 text-[13px] text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-violet text-[11px] font-semibold uppercase text-white">
            {user.email.slice(0, 1)}
          </span>
          <span className="hidden max-w-[200px] truncate sm:inline">{user.email}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      }
      items={[{ label: 'Sign out', icon: LogOut, onSelect: () => void logout() }]}
    />
  );
}

/** Top bar plus page body (DESIGN.md Section 6). */
export function AppShell({
  crumbs,
  title,
  fullBleed = false,
  children,
}: {
  crumbs: Crumb[];
  /** Window title; defaults to the last crumb. */
  title?: string;
  fullBleed?: boolean;
  children: ReactNode;
}) {
  const pageTitle = title ?? crumbs[crumbs.length - 1]?.label;
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · MoodyBlues` : 'MoodyBlues';
  }, [pageTitle]);

  return (
    <div className={cn('app-atmosphere relative flex flex-col', fullBleed ? 'h-full' : 'min-h-full')}>
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-line bg-bg/80 px-4 backdrop-blur-md sm:px-6">
        <Link to="/projects" className="flex shrink-0 items-center gap-2.5 rounded-[var(--radius-control)] pr-1" aria-label="MoodyBlues home">
          <Logo size={26} />
          <Wordmark className="hidden md:inline" />
        </Link>
        <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <Breadcrumb crumbs={crumbs} />
        </div>
        <AccountMenu />
      </header>
      {fullBleed ? (
        <div className="relative z-[1] min-h-0 flex-1">{children}</div>
      ) : (
        <main className="relative z-[1] mx-auto w-full max-w-[1200px] flex-1 animate-rise px-4 pb-16 pt-8 sm:px-8">{children}</main>
      )}
    </div>
  );
}

export function PageHeader({ title, meta, actions, overline }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; overline?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-2">
        {overline && <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{overline}</p>}
        <h1 className="font-display text-[34px] leading-[40px] text-fg">{title}</h1>
        {meta && <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
