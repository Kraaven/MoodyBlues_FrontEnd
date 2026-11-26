import { useEffect, useState } from 'react';
import { errorText } from '../../api/client';
import { FormError, FormNotice } from '../../ui/Field';

/**
 * "Resend code", disabled while the server's cooldown runs (it enforces the same one; counting it
 * down here just keeps the user from hitting a refusal). `onResend` returns the next cooldown.
 */
export function ResendCode({ initialSeconds, onResend }: { initialSeconds: number; onResend: () => Promise<number> }) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counting = remaining > 0;

  useEffect(() => {
    if (!counting) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [counting]);

  const resend = async () => {
    setError(null);
    setSent(false);
    setBusy(true);
    try {
      setRemaining(await onResend());
      setSent(true);
    } catch (err) {
      setError(errorText(err, 'Could not send a new code. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {sent && <FormNotice>A new code is on its way.</FormNotice>}
      <FormError>{error}</FormError>
      <button
        type="button"
        onClick={resend}
        disabled={counting || busy}
        className="text-[14px] text-accent transition-colors hover:text-accent-hover disabled:pointer-events-none disabled:text-fg-3"
      >
        {counting ? `Resend code in ${remaining}s` : 'Resend code'}
      </button>
    </div>
  );
}
