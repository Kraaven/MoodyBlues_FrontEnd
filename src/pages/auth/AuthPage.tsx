import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../../auth/useAuth';
import { safeRedirect } from '../../auth/redirect';
import type { PendingVerificationResponse } from '../../api/types';
import { Button } from '../../ui/Button';
import { Field, FormError, FormNotice } from '../../ui/Field';
import { AuthLayout } from './AuthLayout';
import { useSubmit } from './useSubmit';
import { VerifyRegistration } from './VerifyRegistration';

/** Sign in and create account. Creating an account is two steps: details, then the emailed code. */
export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, login, register, expired } = useAuth();
  const location = useLocation();
  const from = safeRedirect((location.state as { from?: unknown } | null)?.from);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<PendingVerificationResponse | null>(null);
  const { error, busy, run } = useSubmit();
  const login_ = mode === 'login';

  if (user) return <Navigate to={from} replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (login_) await login(email.trim(), password);
      else setPending(await register(email.trim(), password));
    });
  };

  if (pending) {
    return (
      <AuthLayout title="Verify your email">
        <VerifyRegistration email={pending.email} password={password} resendAfterSeconds={pending.resendAfterSeconds} onChangeEmail={() => setPending(null)} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={login_ ? 'Sign in' : 'Create account'}>
      <h1 className="display text-[34px] leading-10 text-fg">{login_ ? 'Sign in' : 'Create your account'}</h1>
      <p className="mt-2 text-[15px] text-fg-2">{login_ ? 'Watch your play sessions again, in 3D.' : 'It takes a minute.'}</p>

      <form onSubmit={onSubmit} className="mt-9 space-y-6">
        {expired && login_ && <FormNotice>Your session expired. Sign in again.</FormNotice>}
        <Field
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="you@studio.com"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Field
          label="Password"
          type="password"
          autoComplete={login_ ? 'current-password' : 'new-password'}
          required
          minLength={login_ ? undefined : 8}
          hint={login_ ? undefined : 'At least 8 characters.'}
          aside={
            login_ ? (
              <Link to="/forgot-password" state={{ email: email.trim(), from }} className="text-fg-2 transition-colors hover:text-fg">
                Forgot password?
              </Link>
            ) : undefined
          }
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          {login_ ? 'Sign in' : 'Continue'}
        </Button>
      </form>

      <p className="mt-8 text-[14px] text-fg-2">
        {login_ ? 'New to MoodyBlues? ' : 'Already have an account? '}
        <Link to={login_ ? '/register' : '/login'} className="text-accent transition-colors hover:text-accent-hover">
          {login_ ? 'Create an account' : 'Sign in'}
        </Link>
      </p>
    </AuthLayout>
  );
}
