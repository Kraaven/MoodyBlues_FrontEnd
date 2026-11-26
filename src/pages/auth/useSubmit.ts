import { useState } from 'react';
import { errorText } from '../../api/client';

/** Busy and error state around one async form action, so each form only writes what it does. */
export function useSubmit() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(errorText(err, 'Something went wrong. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return { error, setError, busy, run };
}
