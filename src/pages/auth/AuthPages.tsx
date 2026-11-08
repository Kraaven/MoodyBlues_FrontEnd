import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { errorText } from '../../api/client';
import { Button } from '../../ui/Button';
import { Field, FormError } from '../../ui/Field';
import { Logo, Wordmark } from '../../ui/Logo';

function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-full md:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden border-r border-line md:flex md:flex-col md:justify-between md:p-12">
        <div aria-hidden="true" className="auth-aurora absolute inset-0" />
        <div className="relative flex items-center gap-3">
          <Logo size={34} />
          <Wordmark className="text-[26px]" />
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-[44px] leading-[52px] text-fg">Watch every play session again, in 3D.</p>
          <p className="mt-4 text-[15px] leading-6 text-fg-2">
            Record a Unity scene on any device, then scrub through what happened in the browser: every object, every spawn,
            every log.
          </p>
        </div>
        <p className="relative text-[12px] text-fg-3">Recorded with the MoodyBlues Unity client</p>
      </aside>

      <div className="app-atmosphere flex flex-col">
        <div className="flex items-center gap-2.5 border-b border-line px-6 py-4 md:hidden">
          <Logo size={26} />
          <Wordmark />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="relative z-[1] w-full max-w-[360px] animate-rise">{children}</div>
        </div>
      </div>
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
  useEffect(() => {
    document.title = 'Sign in · MoodyBlues';
  }, []);
  if (user) return <Navigate to="/projects" replace />;

  return (
    <AuthLayout>
      <h1 className="font-display text-[34px] leading-[40px] text-fg">Sign in</h1>
      <p className="mb-8 mt-1 text-sm text-fg-2">Welcome back.</p>
      {expired && (
        <div className="mb-5">
          <FormError>Your session expired. Sign in again.</FormError>
        </div>
      )}
      <form onSubmit={form.onSubmit} className="space-y-4">
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
      <p className="mt-6 text-center text-sm text-fg-2">
        No account?{' '}
        <Link to="/register" className="font-medium text-accent-bright hover:underline">
          Create one
        </Link>
      </p>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const form = useAuthForm(register);
  useEffect(() => {
    document.title = 'Create account · MoodyBlues';
  }, []);
  if (user) return <Navigate to="/projects" replace />;

  return (
    <AuthLayout>
      <h1 className="font-display text-[34px] leading-[40px] text-fg">Create your account</h1>
      <p className="mb-8 mt-1 text-sm text-fg-2">Then create a project for your Unity game.</p>
      <form onSubmit={form.onSubmit} className="space-y-4">
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
      <p className="mt-6 text-center text-sm text-fg-2">
        Have an account?{' '}
        <Link to="/login" className="font-medium text-accent-bright hover:underline">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
