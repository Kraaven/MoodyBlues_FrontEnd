import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Tooltip } from './Tooltip';
import { cn } from './cn';

export interface Crumb {
  label: string;
  to?: string;
}

/** Truncates the middle of long names so both ends stay recognisable. */
function middleTruncate(text: string, max = 32): string {
  if (text.length <= max) return text;
  const keep = Math.floor((max - 1) / 2);
  return `${text.slice(0, keep)}…${text.slice(text.length - keep)}`;
}

/**
 * The main navigation (DESIGN.md Section 6). Segments are links, the last is the current page. On
 * narrow screens only the last two segments show, so the trail never wraps.
 */
export function Breadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px]">
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1;
        const hiddenOnNarrow = i < crumbs.length - 2;
        const label = middleTruncate(crumb.label);
        const content =
          crumb.to && !last ? (
            <Link to={crumb.to} className="whitespace-nowrap rounded px-1.5 py-1 text-fg-2 transition-colors hover:text-fg">
              {label}
            </Link>
          ) : (
            <span aria-current={last ? 'page' : undefined} className={cn('whitespace-nowrap px-1.5 py-1', last ? 'font-medium text-fg' : 'text-fg-2')}>
              {label}
            </span>
          );
        return (
          <span key={`${crumb.label}-${i}`} className={cn('min-w-0 items-center gap-1', hiddenOnNarrow ? 'hidden sm:flex' : 'flex')}>
            {/* On narrow screens the first visible crumb has nothing before it, so no separator. */}
            {i > 0 && <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-fg-3', i === crumbs.length - 2 && 'hidden sm:block')} aria-hidden="true" />}
            {label !== crumb.label ? <Tooltip content={crumb.label}>{content}</Tooltip> : content}
          </span>
        );
      })}
    </nav>
  );
}
