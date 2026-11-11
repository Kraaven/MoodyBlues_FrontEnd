import { cn } from './cn';

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
