import { useState } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, ChevronDown, ChevronRight, RotateCw } from 'lucide-react';
import { Button } from './Button';
import { cn } from './cn';
import { errorText } from '../api/client';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-[var(--radius-control)] bg-surface-2', className)} />;
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center rounded-[var(--radius-card)] border border-dashed border-line-strong px-6 py-12 text-center', className)}>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-surface-2">
        <Icon className="h-5 w-5 text-accent-bright" />
      </div>
      <p className="text-[15px] font-semibold text-fg">{title}</p>
      {children && <div className="mt-1.5 max-w-md text-sm text-fg-2">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
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
    <div role="alert" className={cn('rounded-[var(--radius-card)] border border-danger/25 bg-danger/[0.06] px-5 py-4', className)}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-fg">{title}</p>
          <p className="text-sm text-fg-2">{errorText(error)}</p>
          {detail && (
            <button type="button" className="inline-flex items-center gap-1 text-[12px] text-fg-3 hover:text-fg-2" onClick={() => setShowDetails((v) => !v)}>
              {showDetails ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Details
            </button>
          )}
          {showDetails && detail && (
            <pre className="mt-1 max-h-48 overflow-auto rounded-[var(--radius-control)] bg-bg p-2 font-mono text-[11px] text-fg-3">{detail}</pre>
          )}
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
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface-2 px-1 font-mono text-[11px] text-fg-2 shadow-[inset_0_-1px_0_rgb(0_0_0/0.4)]">
      {children}
    </kbd>
  );
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-fg-3', className)}>{children}</p>;
}
