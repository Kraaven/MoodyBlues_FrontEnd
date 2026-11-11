import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, RotateCw } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';
import { errorText } from '../api/client';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-[var(--radius-control)] bg-ink-3/80', className)} />;
}

/** A considered empty state: a display line, one plain sentence, and what to do. */
export function EmptyState({
  title,
  children,
  action,
  art,
  className,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  art?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-start gap-5 rounded-[var(--radius-card)] border border-dashed border-rule-strong px-7 py-9', className)}>
      {art}
      <div className="space-y-2">
        <p className="display text-[22px] leading-7 text-fg">{title}</p>
        {children && <div className="max-w-lg text-[14px] text-fg-2">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  error,
  title = 'This did not load',
  onRetry,
  className,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const detail = error instanceof Error && error.stack ? error.stack : null;
  return (
    <div role="alert" className={cn('rounded-[var(--radius-card)] border border-danger/30 bg-ink-1 px-5 py-4', className)}>
      <div className="flex items-start gap-3.5">
        <span aria-hidden="true" className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-danger" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[14px] font-semibold text-fg">{title}</p>
          <p className="text-[14px] text-fg-2">{errorText(error)}</p>
          {detail && (
            <button type="button" className="inline-flex items-center gap-1 pt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-fg-3 hover:text-fg-2" onClick={() => setShowDetails((v) => !v)}>
              {showDetails ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Details
            </button>
          )}
          {showDetails && detail && <pre className="mt-1 max-h-48 overflow-auto rounded-[var(--radius-control)] bg-ink-0 p-2.5 font-mono text-[11px] text-fg-3">{detail}</pre>}
        </div>
        {onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            <RotateCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-[4px] border border-rule-strong bg-ink-3 px-1.5 font-mono text-[11px] text-fg-2 shadow-[inset_0_-1px_0_rgb(0_0_0/0.35)]">
      {children}
    </kbd>
  );
}

/** "PROJECT / APERTURE": a mono uppercase label. */
export function Overline({ children, className, accent = false }: { children: ReactNode; className?: string; accent?: boolean }) {
  return <p className={cn('eyebrow', accent && 'text-accent', className)}>{children}</p>;
}

/** Label on the left, a mono value on the right: the facts in every panel. */
export function FactRow({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-baseline justify-between gap-4 py-2', className)}>
      <dt className="shrink-0 text-[14px] text-fg-2">{label}</dt>
      <dd className="tabular min-w-0 truncate text-right font-mono text-[13px] text-fg">{children}</dd>
    </div>
  );
}
