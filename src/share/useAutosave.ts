import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved';

/**
 * Saves the latest value some time after the last change: edits that arrive while one is waiting or
 * on its way are folded into the next save, so a burst of typing is one request. A save that is
 * still waiting when the host goes away is sent then, so closing a dialog loses nothing.
 */
export function useAutosave<T>(save: (value: T) => Promise<unknown>, onError: (error: unknown) => void, delayMs = 500) {
  const [state, setState] = useState<SaveState>('idle');
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const latest = useRef({ save, onError });
  useEffect(() => {
    latest.current = { save, onError };
  });

  const run = useCallback(async () => {
    timer.current = null;
    if (inFlight.current || !pending.current) return;
    const { value } = pending.current;
    pending.current = null;
    inFlight.current = true;
    try {
      await latest.current.save(value);
      if (!pending.current) setState('saved');
    } catch (error) {
      pending.current = null;
      setState('idle');
      latest.current.onError(error);
    } finally {
      inFlight.current = false;
      if (pending.current && timer.current === null) timer.current = setTimeout(() => void run(), delayMs);
    }
  }, [delayMs]);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      setState('saving');
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => void run(), delayMs);
    },
    [run, delayMs],
  );

  /** Forget what is waiting: something else is about to replace it. */
  const cancel = useCallback(() => {
    pending.current = null;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setState('idle');
  }, []);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
      if (pending.current) void latest.current.save(pending.current.value).catch(latest.current.onError);
    },
    [],
  );

  return { state, schedule, cancel };
}
