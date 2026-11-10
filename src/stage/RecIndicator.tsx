import { Link } from 'react-router-dom';
import { plural } from '../lib/format';

/** The REC light (DESIGN.md 5.2): shown in the chrome while a session in the open project is recording. */
export function RecIndicator({ count, to }: { count: number; to: string }) {
  return (
    <Link
      to={to}
      aria-label={`${plural(count, 'recording')} in progress`}
      className="pointer-events-auto glass flex h-8 items-center gap-2 rounded-full border border-live/35 px-3 text-[12px] font-medium text-fg transition-colors hover:border-live/60"
    >
      <span aria-hidden="true" className="h-2 w-2 animate-pulse-live rounded-full bg-live" />
      <span className="tabular font-mono tracking-wide">REC {count}</span>
    </Link>
  );
}
