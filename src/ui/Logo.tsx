import { cn } from './cn';

/**
 * The mark: "mb." in the display face, amber. The full stop is the record light: it pulses when
 * something is being recorded right now.
 */
export function Mark({ className, live = false }: { className?: string; live?: boolean }) {
  return (
    <span aria-hidden="true" className={cn('display inline-flex items-baseline font-bold leading-none tracking-[-0.04em] text-accent', className)}>
      mb
      <span className={cn('ml-[0.04em] inline-block h-[0.2em] w-[0.2em] rounded-full bg-current', live && 'animate-pulse-live bg-live')} />
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn('display text-[17px] font-medium leading-none tracking-[-0.01em] text-fg', className)}>MoodyBlues</span>;
}

/** Mark and wordmark together, as the top-left of every browse page. */
export function Brand({ className, live }: { className?: string; live?: boolean }) {
  return (
    <span className={cn('inline-flex items-baseline gap-2.5', className)}>
      <Mark className="text-[30px]" live={live} />
      <Wordmark />
    </span>
  );
}
