import { useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../ui/Button';
import { CodeField } from '../../ui/CodeField';
import { FormError } from '../../ui/Field';
import { ResendCode } from './ResendCode';
import { useSubmit } from './useSubmit';

interface VerifyRegistrationProps {
  email: string;
  password: string;
  resendAfterSeconds: number;
  onChangeEmail: () => void;
}

/** Step 2 of sign-up: the account exists only once the emailed code is entered; success signs in. */
export function VerifyRegistration({ email, password, resendAfterSeconds, onChangeEmail }: VerifyRegistrationProps) {
  const { register, verifyRegistration } = useAuth();
  const [code, setCode] = useState('');
  const { error, busy, run } = useSubmit();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => verifyRegistration(email, code));
  };

  // The server treats a repeat registration as "send another code".
  const resend = async () => (await register(email, password)).resendAfterSeconds;

  return (
    <>
      <h1 className="display text-[34px] leading-10 text-fg">Check your email</h1>
      <p className="mt-2 text-[15px] text-fg-2">
        We sent a 6-digit code to <span className="break-all text-fg">{email}</span>.
      </p>

      <form onSubmit={onSubmit} className="mt-9 space-y-6">
        <CodeField autoFocus value={code} onChange={setCode} />
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          Verify and create account
        </Button>
      </form>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <ResendCode initialSeconds={resendAfterSeconds} onResend={resend} />
        <button
          type="button"
          onClick={() => {
            setCode('');
            onChangeEmail();
          }}
          className="text-[14px] text-fg-2 transition-colors hover:text-fg"
        >
          Use a different email
        </button>
      </div>
    </>
  );
}
