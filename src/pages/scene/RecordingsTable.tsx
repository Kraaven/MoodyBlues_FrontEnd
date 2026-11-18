import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, MoreHorizontal, Share2, RotateCw, Trash2, TriangleAlert } from 'lucide-react';
import type { SessionSummary } from '../../api/types';
import { useDeleteSession, useRecompileSession } from '../../api/queries';
import { errorText } from '../../api/client';
import { ActivityGlyph } from '../../ui/ActivityGlyph';
import { ShareDialog } from '../../share/ShareDialog';
import { SessionStatusLabel, Tag } from '../../ui/Chip';
import { ConfirmDialog } from '../../ui/Dialog';
import { IconButton } from '../../ui/Button';
import { Menu } from '../../ui/Menu';
import { Tooltip } from '../../ui/Tooltip';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { formatBytes, formatCaptured, formatCount, formatDateTime, formatDuration, sessionHandle } from '../../lib/format';

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
 * shape of the session (its activity glyph, from the backend), and opens the 3D player when chosen. Live recordings
 * come first; otherwise newest first, as the server returns them.
 */
export function RecordingsTable({ sessions, sessionHref, nested = false }: { sessions: SessionSummary[]; sessionHref: (id: string) => string; nested?: boolean }) {
  const notify = useToast();
  const recompile = useRecompileSession();
  const remove = useDeleteSession();
  const [toDelete, setToDelete] = useState<SessionSummary | null>(null);
  const [toShare, setToShare] = useState<SessionSummary | null>(null);
  const [page, setPage] = useState(0);

  const rows = useMemo(() => [...sessions].sort((a, b) => Number(b.status === 'Recording') - Number(a.status === 'Recording')), [sessions]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  // Clamp during render so a shrinking list (a delete) never leaves an empty page past the end.
  const current = Math.min(page, pages - 1);
  const shown = rows.slice(current * PAGE, current * PAGE + PAGE);

  const onRecompile = async (id: string) => {
    try {
      await recompile.mutateAsync(id);
      notify('Rebuilding the replay.');
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  const grid = 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 md:grid-cols-[minmax(220px,1.4fr)_170px_minmax(90px,0.6fr)_80px_minmax(130px,0.8fr)_40px]';

  return (
    <div>
      <div className={cn(grid, 'hidden px-[18px] pb-2 text-[12px] text-fg-3 md:grid', nested && 'px-4')}>
        <span>Session</span>
        <span>Activity</span>
        <span>Logs</span>
        <span>Duration</span>
        <span>Captured</span>
        <span />
      </div>
      <ul aria-label="Recordings" className="divide-y divide-rule overflow-hidden rounded-[var(--radius-card)] border border-rule bg-ink-1">
        {shown.map((s) => (
          <li key={s.id} className={cn(grid, 'group relative px-[18px] py-3 text-[14px] transition-colors duration-[140ms] focus-within:bg-ink-3/60 hover:bg-ink-3/60', nested && 'px-4')}>
            <Link to={sessionHref(s.id)} className="flex min-w-0 items-center gap-5 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-accent focus-visible:after:ring-inset">
              <span className="tabular w-[64px] shrink-0 font-mono text-[12px] text-fg-3 transition-colors group-hover:text-accent">{sessionHandle(s.id)}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <SessionStatusLabel status={s.status} />
                  {s.isPublic && <Tag tone="accent">Public</Tag>}
                </div>
                {s.status === 'Failed' && s.errorMessage ? (
                  <p className="truncate text-[12px] text-danger" title={s.errorMessage}>
                    {s.errorMessage}
                  </p>
                ) : (
                  <p className="truncate text-[12px] text-fg-3">
                    {formatCount(s.objectCount)} objects{s.spawnCount > 0 && ` · ${formatCount(s.spawnCount)} spawned`} · {formatBytes(s.replaySizeBytes + s.rawLogSizeBytes)}
                  </p>
                )}
              </div>
              {s.status === 'Ready' && !s.endedCleanly && (
                <Tooltip content="Did not end cleanly: the end of the recording may be missing.">
                  <TriangleAlert className="relative z-10 h-4 w-4 shrink-0 text-caution" aria-label="Did not end cleanly" />
                </Tooltip>
              )}
            </Link>
            <div className="hidden md:block">
              <ActivityGlyph session={s} />
            </div>
            <div className="hidden font-mono text-[12px] md:block">
              <LogSummary session={s} />
            </div>
            <span className="tabular hidden font-mono text-[13px] text-fg md:block">{s.durationSeconds > 0 ? formatDuration(s.durationSeconds) : '—'}</span>
            <Tooltip content={formatDateTime(s.createdAtUtc)}>
              <span className="relative z-10 hidden w-fit text-fg-2 md:block">{formatCaptured(s.createdAtUtc)}</span>
            </Tooltip>
            <div className="relative z-10 flex items-center justify-end">
              <Menu
                trigger={
                  <IconButton label="Session actions" size="sm" tooltip={false} className="opacity-60 group-hover:opacity-100">
                    <MoreHorizontal className="h-4 w-4" />
                  </IconButton>
                }
                items={[
                  { label: 'Share…', icon: Share2, onSelect: () => setToShare(s) },
                  // Only a build that failed can be rebuilt; a good replay is never rebuilt from here.
                  ...(s.status === 'Failed' ? [{ label: 'Rebuild replay', icon: RotateCw, onSelect: () => void onRecompile(s.id) }] : []),
                  { label: 'Delete session', icon: Trash2, danger: true, separated: true, onSelect: () => setToDelete(s) },
                ]}
              />
            </div>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-5 pr-2 text-[12px] text-fg-3">
          <span className="tabular">
            {current * PAGE + 1}–{Math.min(rows.length, current * PAGE + PAGE)} of {rows.length}
          </span>
          <IconButton label="Previous page" size="xs" disabled={current === 0} onClick={() => setPage(current - 1)}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Next page" size="xs" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            <ArrowRight className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      )}

      {toShare && <ShareDialog target={toShare} onClose={() => setToShare(null)} />}

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
