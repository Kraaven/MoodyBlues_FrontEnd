import { NavLink } from 'react-router-dom';
import { cn } from './cn';

/** Page-level tabs that are routes (DESIGN.md 7.5: URL-addressable). */
export function RouteTabs({ items }: { items: { to: string; label: string; count?: number; end?: boolean }[] }) {
  return (
    <nav className="flex gap-1 border-b border-line" aria-label="Sections">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            cn(
              '-mb-px flex h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors duration-[120ms]',
              isActive ? 'border-accent text-fg' : 'border-transparent text-fg-2 hover:text-fg',
            )
          }
        >
          {item.label}
          {item.count !== undefined && (
            <span className="tabular rounded-full bg-surface-3 px-1.5 py-px font-mono text-[11px] text-fg-2">{item.count}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** In-panel tabs (state, not routes). */
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
    <div role="tablist" className={cn('flex gap-0.5 rounded-[var(--radius-control)] bg-surface-2 p-0.5', className)}>
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
              'flex h-7 flex-1 items-center justify-center gap-1.5 rounded-[5px] px-2 text-[13px] font-medium transition-colors duration-[120ms]',
              active ? 'bg-surface-3 text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]' : 'text-fg-2 hover:text-fg',
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
