import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Link2, MoreHorizontal, Play, RotateCw, Trash2, TriangleAlert } from 'lucide-react';
import type { SessionSummary } from '../../api/types';
import { useDeleteSession, useRecompileSession } from '../../api/queries';
import { errorText } from '../../api/client';
import { ActivityGlyph } from '../../ui/ActivityGlyph';
import { SessionStatusLabel } from '../../ui/Chip';
import { ConfirmDialog } from '../../ui/Dialog';
import { IconButton } from '../../ui/Button';
import { Menu } from '../../ui/Menu';
import { Tooltip } from '../../ui/Tooltip';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { formatBytes, formatCaptured, formatCount, formatDateTime, formatDuration, sessionHandle } from '../../lib/format';
import { useGlyphTimelines } from './glyphs';

const PAGE = 10;

function LogSummary({ session: s }: { session: SessionSummary }) {
  if (s.status !== 'Ready') return <span className="text-fg-3">—</span>;
  const { errorLogCount: e, warningLogCount: w, infoLogCount: i } = s;
  if (e + w + i === 0) return <span className="text-fg-3">No logs</span>;
  return (
    <span className="tabular flex items-center gap-2.5">
      {e > 0 && <span className="text-danger">{formatCount(e)} err</span>}
      {w > 0 && <span className="text-caution">{formatCount(w)} warn</span>}
      {e === 0 && w === 0 && <span className="text-fg-2">{formatCount(i)} log</span>}
    </span>
  );
}

/**
 * A scene version's recorded sessions. Each row leads with the session's handle and state, shows the
 * shape of the session (its activity glyph), and opens the 3D player when chosen. Live recordings
 * come first; otherwise newest first, as the server returns them.
 */
export function RecordingsTable({ sessions, sessionHref, nested = false }: { sessions: SessionSummary[]; sessionHref: (id: string) => string; nested?: boolean }) {
  const navigate = useNavigate();
  const notify = useToast();
  const recompile = useRecompileSession();
  const remove = useDeleteSession();
  const [toDelete, setToDelete] = useState<SessionSummary | null>(null);
  const [page, setPage] = useState(0);
  const timelines = useGlyphTimelines(sessions);

  const rows = useMemo(() => [...sessions].sort((a, b) => Number(b.status === 'Recording') - Number(a.status === 'Recording')), [sessions]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const longest = Math.max(1, ...sessions.map((s) => s.durationSeconds));

  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(new URL(sessionHref(id), window.location.origin).toString());
      notify('Link copied.');
    } catch {
      notify('Could not copy the link.', 'error');
    }
  };

  const onRecompile = async (id: string) => {
    try {
      await recompile.mutateAsync(id);
      notify('Rebuilding the replay.');
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  const grid = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 md:grid-cols-[minmax(220px,1.4fr)_170px_minmax(90px,0.6fr)_80px_minmax(130px,0.8fr)_112px]';

  return (
    <div>
      <div className={cn(grid, 'eyebrow hidden border-b border-rule px-[18px] pb-3 md:grid', nested && 'px-4')}>
        <span>Session</span>
        <span>Activity</span>
        <span>Logs</span>
        <span>Duration</span>
        <span>Captured</span>
        <span />
      </div>
      <ul aria-label="Recordings" className="mt-2 space-y-1">
        {shown.map((s, i) => (
          <li
            key={s.id}
            tabIndex={0}
            onClick={() => navigate(sessionHref(s.id))}
            onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && navigate(sessionHref(s.id))}
            style={{ animationDelay: `${Math.min(i, 8) * 25}ms` }}
            className={cn(
              grid,
              'group animate-rise cursor-pointer rounded-[var(--radius-control)] px-[18px] py-3.5 text-[14px]',
              'transition-colors duration-[140ms] hover:bg-[#33302a] focus-visible:bg-[#33302a] focus-visible:outline-none',
              nested && 'px-4',
            )}
          >
            <div className="flex min-w-0 items-center gap-5">
              <span className="tabular w-[64px] shrink-0 font-mono text-[12px] text-fg-3 transition-colors group-hover:text-accent">{sessionHandle(s.id)}</span>
              <div className="min-w-0">
                <SessionStatusLabel status={s.status} />
                {s.status === 'Failed' && s.errorMessage ? (
                  <p className="truncate text-[12px] text-[#ff9a8e]" title={s.errorMessage}>
                    {s.errorMessage}
                  </p>
                ) : (
                  <p className="truncate font-mono text-[11px] text-fg-3">
                    {formatCount(s.objectCount)} objects{s.spawnCount > 0 && ` · ${formatCount(s.spawnCount)} spawned`} · {formatBytes(s.replaySizeBytes + s.rawLogSizeBytes)}
                  </p>
                )}
              </div>
              {s.status === 'Ready' && !s.endedCleanly && (
                <Tooltip content="Did not end cleanly: the end of the recording may be missing.">
                  <TriangleAlert className="h-4 w-4 shrink-0 text-caution" aria-label="Did not end cleanly" />
                </Tooltip>
              )}
            </div>
            <div className="hidden md:block">
              <ActivityGlyph session={s} longestSeconds={longest} timeline={timelines.get(s.id)} />
            </div>
            <div className="hidden font-mono text-[12px] md:block">
              <LogSummary session={s} />
            </div>
            <span className="tabular hidden font-mono text-[13px] text-fg md:block">{s.durationSeconds > 0 ? formatDuration(s.durationSeconds) : '—'}</span>
            <Tooltip content={formatDateTime(s.createdAtUtc)}>
              <span className="hidden w-fit text-fg-2 md:block">{formatCaptured(s.createdAtUtc)}</span>
            </Tooltip>
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => navigate(sessionHref(s.id))}
                className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-control)] border border-rule-strong bg-ink-2 px-3.5 text-[14px] text-fg opacity-0 transition-[opacity,border-color] duration-[140ms] hover:border-fg-3 focus-visible:opacity-100 group-hover:opacity-100 group-focus-visible:opacity-100 max-md:opacity-100"
              >
                Watch <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <Menu
                trigger={
                  <IconButton label="Session actions" size="sm" tooltip={false} className="opacity-60 group-hover:opacity-100">
                    <MoreHorizontal className="h-4 w-4" />
                  </IconButton>
                }
                items={[
                  { label: 'Watch', icon: Play, onSelect: () => navigate(sessionHref(s.id)) },
                  { label: 'Copy link', icon: Link2, onSelect: () => void copyLink(s.id) },
                  { label: 'Rebuild replay', icon: RotateCw, onSelect: () => void onRecompile(s.id), disabled: s.status !== 'Ready' && s.status !== 'Failed' },
                  { label: 'Delete session', icon: Trash2, danger: true, separated: true, onSelect: () => setToDelete(s) },
                ]}
              />
            </div>
          </li>
        ))}
      </ul>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-5 pr-2 font-mono text-[12px] text-fg-3">
          <span className="tabular">
            {page * PAGE + 1}–{Math.min(rows.length, page * PAGE + PAGE)} of {rows.length}
          </span>
          <IconButton label="Previous page" size="xs" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Next page" size="xs" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            <ArrowRight className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Delete this session?"
        confirmLabel="Delete session"
        disabledReason={toDelete && (toDelete.status === 'Recording' || toDelete.status === 'Compiling') ? 'This session is still being recorded or built. Wait for it to finish.' : null}
        body={
          toDelete && (
            <p>
              The recording from <span className="text-fg">{formatDateTime(toDelete.createdAtUtc)}</span>
              {toDelete.durationSeconds > 0 && <> ({formatDuration(toDelete.durationSeconds)})</>} and its {formatBytes(toDelete.replaySizeBytes + toDelete.rawLogSizeBytes)} of
              data are deleted for good.
            </p>
          )
        }
        onConfirm={async () => {
          if (!toDelete) return;
          await remove.mutateAsync(toDelete.id);
          notify('Session deleted.');
        }}
      />
    </div>
  );
}

export function RecordingsEmpty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[var(--radius-card)] border border-dashed border-rule-strong px-6 py-8 text-[14px] text-fg-2">{children}</div>;
}
