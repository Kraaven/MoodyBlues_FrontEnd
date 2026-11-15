import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../../auth/useAuth';
import { errorText } from '../../api/client';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { DEMO_POSE } from '../../stage/DemoScene';
import { StageWindow } from '../../stage/StageWindow';
import type { StageView } from '../../stage/store';
import { useStageView } from '../../stage/useStageView';
import { Button } from '../../ui/Button';
import { Field, FormError, FormNotice } from '../../ui/Field';
import { Brand } from '../../ui/Logo';

const DEMO: StageView = { id: 'auth', content: 'demo', pose: DEMO_POSE, drift: true, dim: 1, durationMs: 0 };
const NONE: StageView = { id: 'auth', content: 'none', dim: 0 };

function useAuthForm(submit: (email: string, password: string) => Promise<void>) {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? '/projects';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await submit(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorText(err, 'Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return { email, setEmail, password, setPassword, error, busy, onSubmit };
}

/** Sign in and create account: the form on the left, the product's own scene on the right. */
export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, login, register, expired } = useAuth();
  const form = useAuthForm(mode === 'login' ? login : register);
  const wide = useMediaQuery('(min-width: 1024px)');
  useStageView(wide ? DEMO : NONE);

  useEffect(() => {
    document.title = `${mode === 'login' ? 'Sign in' : 'Create account'} · MoodyBlues`;
  }, [mode]);

  if (user) return <Navigate to="/projects" replace />;
  const login_ = mode === 'login';

  return (
    <div className="relative isolate flex min-h-dvh">
      <main id="main" className="flex w-full flex-col px-6 py-8 sm:px-12 lg:w-[40%] lg:min-w-[480px] lg:max-w-[640px] lg:px-14 lg:py-10">
        <Link to="/login" aria-label="MoodyBlues" className="w-fit">
          <Brand />
        </Link>

        <div className="flex flex-1 items-center py-12">
          <div className="w-full max-w-[400px] animate-rise lg:ml-10">
            <h1 className="display text-[34px] leading-10 text-fg">{login_ ? 'Sign in' : 'Create your account'}</h1>
            <p className="mt-2 text-[15px] text-fg-2">{login_ ? 'Watch your play sessions again, in 3D.' : 'It takes a minute.'}</p>

            <form onSubmit={form.onSubmit} className="mt-9 space-y-6">
              {expired && login_ && <FormNotice>Your session expired. Sign in again.</FormNotice>}
              <Field
                label="Email address"
                type="email"
                autoComplete="email"
                placeholder="you@studio.com"
                required
                autoFocus
                value={form.email}
                onChange={(e) => form.setEmail(e.target.value)}
              />
              <Field
                label="Password"
                type="password"
                autoComplete={login_ ? 'current-password' : 'new-password'}
                required
                minLength={login_ ? undefined : 8}
                hint={login_ ? undefined : 'At least 8 characters.'}
                value={form.password}
                onChange={(e) => form.setPassword(e.target.value)}
              />
              <FormError>{form.error}</FormError>
              <Button type="submit" size="lg" className="w-full" loading={form.busy}>
                {login_ ? 'Sign in' : 'Create account'}
              </Button>
            </form>

            <p className="mt-8 text-[14px] text-fg-2">
              {login_ ? 'New to MoodyBlues? ' : 'Already have an account? '}
              <Link to={login_ ? '/register' : '/login'} className="text-accent transition-colors hover:text-accent-hover">
                {login_ ? 'Create an account' : 'Sign in'}
              </Link>
            </p>
          </div>
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