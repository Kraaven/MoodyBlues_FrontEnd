import { NavLink } from 'react-router-dom';
import { cn } from './cn';

/** Page-level tabs that are routes: large labels, an amber underline under the current one. */
export function RouteTabs({ items, className }: { items: { to: string; label: string; count?: number; end?: boolean }[]; className?: string }) {
  return (
    <nav className={cn('flex gap-2 overflow-x-auto border-b border-rule sm:gap-8', className)} aria-label="Sections">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          replace
          className={({ isActive }) =>
            cn(
              'group relative -mb-px flex h-12 shrink-0 items-center gap-3 px-1 text-[16px] transition-colors duration-[140ms] sm:min-w-[150px]',
              isActive ? 'text-fg' : 'text-fg-2 hover:text-fg',
            )
          }
        >
          {({ isActive }) => (
            <>
              {item.label}
              {item.count !== undefined && (
                <span className={cn('tabular font-mono text-[11px]', isActive ? 'text-accent' : 'text-fg-3')}>{String(item.count).padStart(2, '0')}</span>
              )}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute inset-x-0 bottom-0 h-[2px] origin-left rounded-full bg-accent transition-transform duration-[260ms] ease-[var(--ease-out-soft)]',
                  isActive ? 'scale-x-100' : 'scale-x-0',
                )}
              />
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** In-window filter tabs, mono and uppercase: "ALL 86   WARNINGS 3   ERRORS 1". */
export function FilterTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: { id: T; label: string; count?: number; tone?: 'warn' | 'error' }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('flex gap-5 border-b border-rule', className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'relative -mb-px flex h-9 items-center gap-1.5 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.06em] transition-colors duration-[140ms]',
              active ? 'text-accent' : 'text-fg-3 hover:text-fg-2',
            )}
          >
            {item.label}
            {item.count !== undefined && <span className="tabular">{item.count}</span>}
            {active && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

/** A small two- or three-way switch. */
export function SegmentTabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: { id: T; label: string; badge?: number | string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn('flex gap-0.5 rounded-[var(--radius-control)] border border-rule bg-ink-0/50 p-0.5', className)}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'flex h-7 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] px-2.5 text-[12px] font-medium transition-colors duration-[140ms]',
              active ? 'bg-ink-4 text-fg' : 'text-fg-3 hover:text-fg',
            )}
          >
            {item.label}
            {item.badge !== undefined && <span className="tabular font-mono text-[11px] text-fg-3">{item.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
