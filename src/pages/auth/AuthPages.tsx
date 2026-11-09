import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { errorText } from '../../api/client';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { Chrome } from '../../stage/Chrome';
import type { StageView } from '../../stage/store';
import { useStageView } from '../../stage/useStageView';
import { Button } from '../../ui/Button';
import { Field, FormError, FormNotice } from '../../ui/Field';

/**
 * The Trace at full strength, framed so its mass sits to the right of the text column. Phones get
 * the static gradient instead of a live canvas (DESIGN.md 7.1): the stage is paused and faded out,
 * which also saves the battery.
 */
const LIVE: StageView = {
  id: 'auth',
  content: 'trace',
  pose: { position: [-8, 9, 30], target: [-8, -1, 0], fov: 50 },
  drift: true,
  dim: 1,
};
const STILL: StageView = { id: 'auth', content: 'none', dim: 0 };

function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  const phone = useMediaQuery('(max-width: 639px)');
  useStageView(phone ? STILL : LIVE);
  useEffect(() => {
    document.title = `${title} · MoodyBlues`;
  }, [title]);

  return (
    <div className="relative min-h-full">
      <Chrome />
      {/* Keeps the headline and form legible over the ribbons. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-gradient-to-r from-ink-0/90 via-ink-0/55 to-transparent sm:via-ink-0/45" />
      <main id="main" className="relative z-[1] flex min-h-full items-center px-5 py-24 sm:px-12 lg:px-24">
        <div className="w-full max-w-[420px] animate-rise space-y-8">
          <div className="space-y-4">
            <p className="font-display text-[40px] leading-[44px] text-fg sm:text-[52px] sm:leading-[56px]">Watch every play session again, in 3D.</p>
            <p className="text-[14px] leading-6 text-fg-2">Record a Unity scene on any device, then scrub through every object, spawn and log in the browser.</p>
          </div>
          <div className="glass elevated rounded-[var(--radius-dialog)] border border-rule p-6">{children}</div>
        </div>
      </main>
    </div>
  );
}

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

export function LoginPage() {
  const { user, login, expired } = useAuth();
  const form = useAuthForm(login);
  if (user) return <Navigate to="/projects" replace />;

  return (
    <AuthLayout title="Sign in">
      <h1 className="font-display text-[30px] leading-9 text-fg">Sign in</h1>
      <form onSubmit={form.onSubmit} className="mt-5 space-y-4">
        {expired && <FormNotice>Your session expired. Sign in again.</FormNotice>}
        <Field label="Email" type="email" autoComplete="email" required autoFocus value={form.email} onChange={(e) => form.setEmail(e.target.value)} />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={form.password}
          onChange={(e) => form.setPassword(e.target.value)}
        />
        <FormError>{form.error}</FormError>
        <Button type="submit" className="w-full" loading={form.busy}>
          Sign in
        </Button>
      </form>
      <p className="mt-5 text-center text-[13px] text-fg-2">
        No account?{' '}
        <Link to="/register" className="font-medium text-blue-bright hover:underline">
          Create one
        </Link>
      </p>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const form = useAuthForm(register);
  if (user) return <Navigate to="/projects" replace />;

  return (
    <AuthLayout title="Create account">
      <h1 className="font-display text-[30px] leading-9 text-fg">Create your account</h1>
      <form onSubmit={form.onSubmit} className="mt-5 space-y-4">
        <Field label="Email" type="email" autoComplete="email" required autoFocus value={form.email} onChange={(e) => form.setEmail(e.target.value)} />
        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="At least 8 characters."
          value={form.password}
          onChange={(e) => form.setPassword(e.target.value)}
        />
        <FormError>{form.error}</FormError>
        <Button type="submit" className="w-full" loading={form.busy}>
          Create account
        </Button>
      </form>
      <p className="mt-5 text-center text-[13px] text-fg-2">
        Have an account?{' '}
        <Link to="/login" className="font-medium text-blue-bright hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
