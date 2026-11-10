import type { ReactNode } from 'react';
import { useWindowTitle } from '../lib/useWindowTitle';
import { Chrome } from '../stage/Chrome';
import type { Crumb } from '../ui/Breadcrumb';
import { cn } from '../ui/cn';

/**
 * A list view over the Stage (DESIGN.md Section 6): floating chrome, then a content column. The page
 * is transparent, so the Stage behind it shows through between the cards.
 */
export function ViewShell({
  crumbs,
  title,
  trailing,
  width = 'wide',
  children,
}: {
  crumbs: Crumb[];
  /** Window title; defaults to the last crumb. */
  title?: string;
  trailing?: ReactNode;
  width?: 'wide' | 'narrow';
  children: ReactNode;
}) {
  useWindowTitle(title ?? crumbs[crumbs.length - 1]?.label);
  return (
    <div className="relative min-h-full">
      <Chrome crumbs={crumbs} trailing={trailing} />
      <main id="main" className={cn('relative z-[1] mx-auto w-full animate-rise px-4 pb-20 pt-24 sm:px-8', width === 'wide' ? 'max-w-[1100px]' : 'max-w-[760px]')}>
        {children}
      </main>
    </div>
  );
}

export function PageHeader({ title, meta, actions, overline }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; overline?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-2">
        {overline && <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{overline}</p>}
        <h1 className="font-display text-[36px] leading-10 text-fg">{title}</h1>
        {meta && <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
