import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { Breadcrumb, type Crumb } from '../ui/Breadcrumb';
import { Logo, Wordmark } from '../ui/Logo';
import { Menu } from '../ui/Menu';
import { cn } from '../ui/cn';

function AccountMenu() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <Menu
      trigger={
        <button
          type="button"
          aria-label={`Account: ${user.email}`}
          className="pointer-events-auto flex h-8 items-center gap-2 rounded-[var(--radius-control)] px-2 text-[13px] text-fg-2 transition-colors hover:bg-ink-2 hover:text-fg"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-blue to-blue-deep text-[11px] font-semibold uppercase text-white">
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

function Brand() {
  const { user } = useAuth();
  return (
    <Link
      to={user ? '/projects' : '/login'}
      aria-label="MoodyBlues home"
      className="pointer-events-auto flex shrink-0 items-center gap-2.5 rounded-[var(--radius-control)] pr-1"
    >
      <Logo size={26} />
      <Wordmark className="hidden sm:inline" />
    </Link>
  );
}

/**
 * Wayfinding that floats on the Stage (DESIGN.md Section 6).
 *
 * - `floating` (browse views): fixed to the top, no bar. The brand sits left, the account menu
 *   right, and the breadcrumb on a glass pill between them that appears only once there is a trail.
 *   A soft scrim keeps the controls legible when page content scrolls beneath them.
 * - `line` (tool views, the player): one translucent line that takes its own height, so the 3D view
 *   below it keeps every pixel.
 *
 * `trailing` is for status that belongs in the chrome, such as the recording indicator.
 */
export function Chrome({ crumbs = [], variant = 'floating', trailing }: { crumbs?: Crumb[]; variant?: 'floating' | 'line'; trailing?: ReactNode }) {
  const floating = variant === 'floating';

  return (
    <>
      <a
        href="#main"
        className="fixed left-3 top-3 z-[90] -translate-y-20 rounded-[var(--radius-control)] bg-blue px-3 py-2 text-[13px] font-medium text-white focus:translate-y-0"
      >
        Skip to content
      </a>
      <header className={cn(floating ? 'pointer-events-none fixed inset-x-0 top-0 z-40' : 'glass relative z-40 shrink-0 border-b border-rule')}>
        {floating && <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[88px] bg-gradient-to-b from-ink-0/95 via-ink-0/60 to-transparent" />}
        <div className={cn('relative flex items-center gap-3', floating ? 'px-4 py-3 sm:px-6' : 'h-11 px-3 sm:px-4')}>
          <Brand />
          {crumbs.length > 0 && (
            <div
              className={cn(
                'pointer-events-auto min-w-0 overflow-hidden',
                floating ? 'glass rounded-full border border-rule px-2 py-0.5' : 'ml-1 border-l border-rule pl-3',
              )}
            >
              <Breadcrumb crumbs={crumbs} />
            </div>
          )}
          <div className="flex-1" />
          {trailing}
          <AccountMenu />
        </div>
      </header>
    </>
  );
}
