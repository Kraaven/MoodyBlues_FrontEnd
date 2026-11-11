import { Link } from 'react-router-dom';
import { ArrowRight, Play, X } from 'lucide-react';
import type { SessionSummary } from '../api/types';
import { SessionStatusLabel, versionLabel } from '../ui/Chip';
import { IconButton } from '../ui/Button';
import { Skeleton } from '../ui/States';
import { cn } from '../ui/cn';
import { formatCaptured, formatDuration, formatCount, plural, sessionHandle } from '../lib/format';

/** A frame of film with a play mark: the Cinema logo. */
function CinemaMark({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,box-shadow] duration-[260ms]',
        active ? 'bg-accent shadow-[0_0_24px_rgb(245_181_68/0.55)]' : 'bg-ink-4',
      )}
    >
      <svg viewBox="0 0 28 22" className="h-[18px] w-[22px]">
        <rect x="1" y="1" width="26" height="20" rx="3.5" fill="none" stroke={active ? '#1f1a12' : '#f5b544'} strokeWidth="1.6" />
        {[5, 11, 17, 23].map((x) => (
          <g key={x} fill={active ? '#1f1a12' : '#f5b544'}>
            <rect x={x - 1.1} y="3.2" width="2.2" height="1.6" rx="0.5" />
            <rect x={x - 1.1} y="17.2" width="2.2" height="1.6" rx="0.5" />
          </g>
        ))}
        <path d="M11.5 7.6 L18 11 L11.5 14.4 Z" fill={active ? '#1f1a12' : '#f5b544'} />
      </svg>
    </span>
  );
}

/**
 * The Cinema switch, top centre. Cinema is where recordings are watched: it brings in the list of
 * recordings from the left, the timeline from the bottom and the events from the right.
 */
export function CinemaButton({ active, count, live, onToggle }: { active: boolean; count: number | null; live: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={active ? 'Leave Cinema (R)' : 'Watch recordings in Cinema (R)'}
      className={cn(
        'glass elevated pointer-events-auto group inline-flex h-14 items-center gap-3.5 rounded-full border py-2 pl-2 pr-6 transition-[border-color,box-shadow] duration-[260ms]',
        active ? 'border-accent/45 shadow-[0_14px_44px_-14px_rgb(245_181_68/0.55)]' : 'border-rule-strong/60 hover:border-fg-3/60',
      )}
    >
      <CinemaMark active={active} />
      <span className={cn('display text-[20px] leading-none tracking-[-0.01em] transition-colors', active ? 'text-accent' : 'text-fg')}>Cinema</span>
      {count !== null && (
        <span className="hidden items-center gap-2 border-l border-rule-strong pl-3.5 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-3 sm:inline-flex">
          {live && <span className="h-1.5 w-1.5 animate-pulse-live rounded-full bg-live" />}
          {plural(count, 'recording')}
        </span>
      )}
    </button>
  );
}

/** The recordings of the scene version on screen, slid in from the left in Cinema. */
export function RecordingsDrawer({
  open,
  sessions,
  version,
  sceneName,
  currentId,
  sessionHref,
  historyHref,
  onClose,
}: {
  open: boolean;
  sessions: SessionSummary[] | undefined;
  version: number | null;
  sceneName: string;
  currentId: string | null;
  sessionHref: (id: string) => string;
  historyHref: string;
  onClose: () => void;
}) {
  return (
    <aside
      aria-label="Recordings"
      aria-hidden={!open}
      className={cn(
        'elevated pointer-events-auto absolute bottom-0 left-0 top-0 z-30 flex w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden rounded-[12px] border border-rule-strong/60 bg-ink-1',
        'transition-[transform,opacity] duration-[420ms] ease-[var(--ease-out-soft)]',
        open ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-[calc(100%+40px)] opacity-0',
      )}
    >
      <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-rule bg-ink-3/70 pl-5 pr-2">
        <p className="flex-1 text-[16px] font-medium text-fg">Recordings</p>
        <IconButton label="Hide recordings" size="sm" onClick={onClose}>
          <X className="h-[18px] w-[18px]" />
        </IconButton>
      </header>
      <div className="flex items-baseline justify-between gap-3 px-6 pb-3 pt-5">
        <span className="truncate font-mono text-[14px] text-fg-2">
          {sceneName} / {version !== null ? versionLabel(version) : '…'}
        </span>
        {sessions && <span className="shrink-0 text-[14px] text-accent">{plural(sessions.length, 'session')}</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {!sessions ? (
          <div className="space-y-2 px-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="px-3 py-4 text-[14px] leading-6 text-fg-2">No sessions were recorded in this version yet. Press Play in Unity with recording on, and it appears here.</p>
        ) : (
          <ul className="space-y-1">
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
                      className={cn('group flex gap-4 rounded-[10px] px-3 py-3.5 transition-colors duration-[140ms]', current ? 'bg-accent/14' : 'hover:bg-ink-3')}
                    >
                      <span className={cn('tabular w-[58px] shrink-0 pt-0.5 font-mono text-[12px]', current ? 'text-accent' : 'text-fg-3')}>{sessionHandle(s.id)}</span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-[16px]', current ? 'text-accent' : 'text-fg')}>{formatCaptured(s.createdAtUtc)}</span>
                        <span className="mt-1 flex items-center gap-3">
                          <SessionStatusLabel status={s.status} />
                          {s.status === 'Ready' && (s.errorLogCount > 0 || s.warningLogCount > 0) && (
                            <span className="font-mono text-[11px]">
                              {s.errorLogCount > 0 && <span className="text-danger">{formatCount(s.errorLogCount)} err </span>}
                              {s.warningLogCount > 0 && <span className="text-caution">{formatCount(s.warningLogCount)} warn</span>}
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block font-mono text-[12px] text-fg-3">{s.durationSeconds > 0 ? formatDuration(s.durationSeconds) : '—'}</span>
                      </span>
                      <Play className={cn('mt-1 h-5 w-5 shrink-0 transition-colors', current ? 'fill-accent text-accent' : 'text-fg-3 group-hover:text-fg')} strokeWidth={1.6} />
                    </Link>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
      <div className="shrink-0 border-t border-rule px-6 py-4">
        <p className="text-[13px] text-fg-3">Older sessions live with their scene version.</p>
        <Link to={historyHref} className="mt-1.5 inline-flex items-center gap-1.5 text-[15px] text-accent hover:text-accent-hover">
          View version history <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </aside>
  );
}
