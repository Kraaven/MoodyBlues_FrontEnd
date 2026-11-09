import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Chrome } from '../stage/Chrome';
import type { Crumb } from '../ui/Breadcrumb';
import { cn } from '../ui/cn';

export type { Crumb };

/**
 * Chrome plus page body. Temporary: pages still paint their own opaque backdrop here until each is
 * moved onto the Stage (REBUILD_PLAN.md Phases 3 and 4), at which point this file goes away.
 */
export function AppShell({
  crumbs,
  title,
  fullBleed = false,
  trailing,
  children,
}: {
  crumbs: Crumb[];
  /** Window title; defaults to the last crumb. */
  title?: string;
  fullBleed?: boolean;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  const pageTitle = title ?? crumbs[crumbs.length - 1]?.label;
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · MoodyBlues` : 'MoodyBlues';
  }, [pageTitle]);

  return (
    <div className={cn('app-atmosphere relative flex flex-col', fullBleed ? 'h-full' : 'min-h-full')}>
      <Chrome crumbs={crumbs} variant={fullBleed ? 'line' : 'floating'} trailing={trailing} />
      {fullBleed ? (
        <div id="main" className="relative z-[1] min-h-0 flex-1">
          {children}
        </div>
      ) : (
        <main id="main" className="relative z-[1] mx-auto w-full max-w-[1200px] flex-1 animate-rise px-4 pb-16 pt-24 sm:px-8">
          {children}
        </main>
      )}
    </div>
  );
}

export function PageHeader({ title, meta, actions, overline }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; overline?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-2">
        {overline && <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{overline}</p>}
        <h1 className="font-display text-[34px] leading-[40px] text-fg">{title}</h1>
        {meta && <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
