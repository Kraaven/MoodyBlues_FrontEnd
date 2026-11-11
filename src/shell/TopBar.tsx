import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, LogOut, Menu as MenuIcon, UserRound } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { Brand, Mark } from '../ui/Logo';
import { Button, IconButton } from '../ui/Button';
import { Menu } from '../ui/Menu';
import { cn } from '../ui/cn';
import { useSetupGuide } from './SetupGuide';

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

/**
 * The bar across the top of every page that is not a 3D view. `children` replaces the default
 * left-hand navigation (the scene page puts its back link and crumbs there).
 */
export function TopBar({ children, live, onMenu, className }: { children?: ReactNode; live?: boolean; onMenu?: () => void; className?: string }) {
  const showGuide = useSetupGuide((s) => s.show);
  return (
    <header className={cn('sticky top-0 z-30 flex h-[72px] shrink-0 items-center gap-4 border-b border-rule bg-ink-2/95 px-5 backdrop-blur-md sm:px-7', className)}>
      {onMenu && (
        <IconButton label="Projects" className="-ml-2 lg:hidden" onClick={onMenu} tooltip={false}>
          <MenuIcon className="h-5 w-5" />
        </IconButton>
      )}
      {children ? (
        <>
          <Link to="/projects" aria-label="MoodyBlues home" className="shrink-0">
            <Mark className="text-[30px]" live={live} />
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-6">{children}</div>
        </>
      ) : (
        <>
          <Link to="/projects" aria-label="MoodyBlues home" className="shrink-0">
            <Brand live={live} className="max-sm:[&>span:last-child]:hidden" />
          </Link>
          <nav className="ml-6 hidden min-w-0 flex-1 items-center gap-6 md:flex" aria-label="Main">
            <Link to="/projects" className="text-[14px] text-fg-2 transition-colors hover:text-fg">
              Workspace
            </Link>
          </nav>
          <div className="flex-1 md:hidden" />
        </>
      )}
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="quiet" className="min-w-[150px] justify-start max-sm:hidden" onClick={() => showGuide()}>
          <BookOpen className="h-4 w-4 text-fg-3" />
          Unity setup
        </Button>
        <AccountMenu />
      </div>
    </header>
  );
}
