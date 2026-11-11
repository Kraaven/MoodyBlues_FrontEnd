import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import type { SessionSummary } from '../../api/types';
import { SessionStatusLabel, versionLabel } from '../../ui/Chip';
import { Skeleton } from '../../ui/States';
import { cn } from '../../ui/cn';
import { formatCaptured, formatCount, formatDuration, plural, sessionHandle } from '../../lib/format';

/** The recordings of the scene version on screen. Choosing one plays it on this scene. */
export function RecordingsWindow({
  sessions,
  version,
  currentId,
  sessionHref,
}: {
  sessions: SessionSummary[] | undefined;
  version: number | null;
  currentId: string | null;
  sessionHref: (id: string) => string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-baseline justify-between gap-3 px-5 pb-2 pt-4 text-[13px] text-fg-3">
        <span className="tabular">{version !== null ? versionLabel(version) : '…'}</span>
        {sessions && <span>{plural(sessions.length, 'recording')}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!sessions ? (
          <div className="space-y-2 px-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="px-3 py-3 text-[14px] leading-6 text-fg-2">No recordings in this version yet. Press Play in Unity with recording on, and it appears here.</p>
        ) : (
          <ul className="space-y-0.5">
            {[...sessions]
              .sort((a, b) => Number(b.status === 'Recording') - Number(a.status === 'Recording'))
              .map((s) => {
                const current = s.id === currentId;
                return (
                  <li key={s.id}>
                    <Link
                      to={sessionHref(s.id)}
                      replace
                      aria-current={current ? 'true' : undefined}
                      className={cn('group flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 transition-colors duration-[140ms]', current ? 'bg-accent/14' : 'hover:bg-ink-3')}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-[14px]', current ? 'text-accent' : 'text-fg')}>{formatCaptured(s.createdAtUtc)}</span>
                        <span className="mt-0.5 flex items-center gap-3 text-[12px] text-fg-3">
                          <SessionStatusLabel status={s.status} />
                          <span className="tabular">{s.durationSeconds > 0 ? formatDuration(s.durationSeconds) : '—'}</span>
                          {s.status === 'Ready' && s.errorLogCount > 0 && <span className="text-danger">{formatCount(s.errorLogCount)} err</span>}
                          {s.status === 'Ready' && s.warningLogCount > 0 && <span className="text-caution">{formatCount(s.warningLogCount)} warn</span>}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-fg-3">{sessionHandle(s.id)}</span>
                      <Play className={cn('h-4 w-4 shrink-0 transition-colors', current ? 'fill-accent text-accent' : 'text-fg-3 group-hover:text-fg')} strokeWidth={1.6} />
                    </Link>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </div>
  );
}
