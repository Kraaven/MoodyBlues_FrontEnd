import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../../auth/useAuth';
import { safeRedirect } from '../../auth/redirect';
import type { PendingVerificationResponse } from '../../api/types';
import { Button } from '../../ui/Button';
import { CodeField } from '../../ui/CodeField';
import { Field, FormError } from '../../ui/Field';
import { AuthLayout } from './AuthLayout';
import { ResendCode } from './ResendCode';
import { useSubmit } from './useSubmit';

/** Reset a forgotten password: the email, then the emailed code with the new password. Success signs in. */
export function ForgotPasswordPage() {
  const { user, requestPasswordReset, resetPassword } = useAuth();
  const location = useLocation();
  const state = location.state as { email?: unknown; from?: unknown } | null;
  const from = safeRedirect(state?.from);
  const [email, setEmail] = useState(typeof state?.email === 'string' ? state.email : '');
  const [pending, setPending] = useState<PendingVerificationResponse | null>(null);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const { error, busy, run } = useSubmit();

  if (user) return <Navigate to={from} replace />;

  const onRequest = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => setPending(await requestPasswordReset(email.trim())));
  };

  const onReset = (e: FormEvent) => {
    e.preventDefault();
    if (pending) void run(() => resetPassword(pending.email, code, newPassword));
  };

  if (pending) {
    return (
      <AuthLayout title="Reset password">
        <h1 className="display text-[34px] leading-10 text-fg">Check your email</h1>
        <p className="mt-2 text-[15px] text-fg-2">
          If <span className="break-all text-fg">{pending.email}</span> has an account, we sent it a 6-digit code.
        </p>

        <form onSubmit={onReset} className="mt-9 space-y-6">
          <CodeField autoFocus value={code} onChange={setCode} />
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            hint="At least 8 characters."
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <FormError>{error}</FormError>
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Reset password and sign in
          </Button>
        </form>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <ResendCode initialSeconds={pending.resendAfterSeconds} onResend={async () => (await requestPasswordReset(pending.email)).resendAfterSeconds} />
          <button
            type="button"
            onClick={() => {
              setCode('');
              setNewPassword('');
              setPending(null);
            }}
            className="text-[14px] text-fg-2 transition-colors hover:text-fg"
          >
            Use a different email
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset password">
      <h1 className="display text-[34px] leading-10 text-fg">Reset your password</h1>
      <p className="mt-2 text-[15px] text-fg-2">Enter your email and we will send you a code.</p>

      <form onSubmit={onRequest} className="mt-9 space-y-6">
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
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Send code
        </Button>
      </form>

      <p className="mt-8 text-[14px] text-fg-2">
        <Link to="/login" state={{ from }} className="text-accent transition-colors hover:text-accent-hover">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
