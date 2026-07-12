import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useAuth } from '../auth/useAuth';
import { ApiError } from '../lib/api';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b0b0f] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2 text-center">
          <Sparkles className="h-8 w-8 text-violet-400" />
          <h1 className="text-2xl font-semibold text-white">Welcome back</h1>
          <p className="text-sm text-zinc-400">Sign in to manage your projects and scenes.</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-white/10 bg-[#131317] p-6">
          <div>
            <label className="mb-1.5 block text-sm text-zinc-300" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm text-zinc-300" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-violet-400/60"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400 disabled:opacity-50"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          No account yet?{' '}
          <Link to="/register" className="text-violet-400 hover:text-violet-300">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
