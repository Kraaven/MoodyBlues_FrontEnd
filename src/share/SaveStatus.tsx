import { cn } from '../ui/cn';
import type { SaveState } from './useAutosave';

/** A small "Saving…" or "Saved" beside settings that save by themselves. Reserves its space so the layout does not jump. */
export function SaveStatus({ state, className }: { state: SaveState; className?: string }) {
  return (
    <span role="status" aria-live="polite" className={cn('min-w-[4.5rem] text-right font-mono text-[12px] text-fg-3', className)}>
      {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : ''}
    </span>
  );
}
