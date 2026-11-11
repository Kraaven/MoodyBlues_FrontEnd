import { useId } from 'react';
import { cn } from './cn';

/**
 * The mark: a crescent moon whose cut-out is a play triangle. Replay, after hours. It is drawn
 * with `currentColor` (amber by default) and turns the record-light rose while something is being
 * recorded right now.
 */
export function Mark({ className, live = false }: { className?: string; live?: boolean }) {
  const id = useId();
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn('inline-block h-[1em] w-[1em] shrink-0 transition-colors duration-[260ms]', live ? 'animate-pulse text-live' : 'text-accent', className)}>
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="#fff" />
          {/* the bite that makes the crescent */}
          <circle cx="16" cy="8.6" r="8.4" fill="#000" />
          {/* the play triangle, cut from the thick part */}
          <path d="M5.8 12.6v4.8l4-2.4z" fill="#000" stroke="#000" strokeWidth="0.8" strokeLinejoin="round" />
        </mask>
      </defs>
      <circle cx="12" cy="12" r="10" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn('text-[15px] font-semibold leading-none tracking-[-0.01em] text-fg', className)}>MoodyBlues</span>;
}

/** Mark and wordmark together, as the top-left of every browse page. */
export function Brand({ className, live }: { className?: string; live?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Mark className="text-[24px]" live={live} />
      <Wordmark />
    </span>
  );
}
