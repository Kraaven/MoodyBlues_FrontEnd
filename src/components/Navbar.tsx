import { Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { IconButton } from './ui/Button';

export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-10 border-b border-hairline bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-ink">Moody Blues</span>
        </Link>

        {user && (
          <div className="flex items-center gap-3 text-sm text-ink-muted">
            <span className="hidden sm:inline">{user.email}</span>
            <IconButton title="Sign out" aria-label="Sign out" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </IconButton>
          </div>
        )}
      </div>
    </header>
  );
}
