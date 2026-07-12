import { Link } from 'react-router-dom';
import { LogOut, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/useAuth';

export function Navbar() {
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0b0b0f]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-white">
          <Sparkles className="h-5 w-5 text-violet-400" />
          Moody Blues
        </Link>

        {user && (
          <div className="flex items-center gap-4 text-sm text-zinc-400">
            <span>{user.email}</span>
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-zinc-300 transition hover:border-white/20 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
