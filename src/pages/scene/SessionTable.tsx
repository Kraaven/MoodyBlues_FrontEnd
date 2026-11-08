import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clapperboard, Link2, MoreHorizontal, Play, RotateCw, Trash2 } from 'lucide-react';
import type { SessionSummary } from '../../api/types';
import { useDeleteSession, useRecompileSession } from '../../api/queries';
import { errorText } from '../../api/client';
import { SessionStatusChip } from '../../ui/Chip';
import { ConfirmDialog } from '../../ui/Dialog';
import { IconButton } from '../../ui/Button';
import { Menu } from '../../ui/Menu';
import { Tooltip } from '../../ui/Tooltip';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { formatBytes, formatCount, formatDateTime, formatDuration, formatRecorded } from '../../lib/format';

/** Problems worth flagging in the Health column (DESIGN.md 7.5). */
function healthIssues(s: SessionSummary): string[] {
  const issues: string[] = [];
  if (s.status === 'Ready' && !s.endedCleanly) issues.push('Did not end cleanly: the end of the recording may be missing.');
  return issues;
}

const GRID = 'grid grid-cols-[minmax(150px,1.2fr)_minmax(120px,1fr)_72px_minmax(110px,0.9fr)_96px_56px_80px_40px] items-center gap-3';

export function SessionTable({ sessions, sessionHref }: { sessions: SessionSummary[]; sessionHref: (id: string) => string }) {
  const navigate = useNavigate();
  const notify = useToast();
  const recompile = useRecompileSession();
  const remove = useDeleteSession();
  const [toDelete, setToDelete] = useState<SessionSummary | null>(null);

  // Live recordings first (DESIGN.md 7.5), otherwise newest first as the API returns them.
  const rows = [...sessions].sort((a, b) => Number(b.status === 'Recording') - Number(a.status === 'Recording'));

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

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface-1">
      <div role="table" aria-label="Sessions" className="min-w-[860px]">
        <div role="row" className={cn(GRID, 'h-10 border-b border-line px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3')}>
          <span>Status</span>
          <span>Recorded</span>
          <span>Duration</span>
          <span>Objects</span>
          <span>Logs</span>
          <span>Health</span>
          <span className="text-right">Size</span>
          <span />
        </div>
        {rows.map((s, i) => {
          const issues = healthIssues(s);
          return (
            <div
              key={s.id}
              role="row"
              tabIndex={0}
              onClick={() => navigate(sessionHref(s.id))}
              onKeyDown={(e) => e.key === 'Enter' && navigate(sessionHref(s.id))}
              style={{ animationDelay: `${Math.min(i, 8) * 20}ms` }}
              className={cn(
                GRID,
                'group min-h-[52px] animate-rise cursor-pointer border-b border-line px-4 py-2 text-[13px] last:border-b-0',
                'transition-colors duration-[120ms] hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none',
              )}
            >
              <div className="min-w-0 space-y-1">
                <SessionStatusChip status={s.status} />
                {s.status === 'Failed' && s.errorMessage && <p className="truncate text-[12px] text-[#ff9b9b]" title={s.errorMessage}>{s.errorMessage}</p>}
              </div>
              <Tooltip content={formatDateTime(s.createdAtUtc)}>
                <span className="w-fit text-fg">{formatRecorded(s.createdAtUtc)}</span>
              </Tooltip>
              <span className="tabular font-mono text-[12px] text-fg-2">{s.status === 'Ready' || s.durationSeconds > 0 ? formatDuration(s.durationSeconds) : '—'}</span>
              <span className="tabular font-mono text-[12px] text-fg-2">
                {formatCount(s.objectCount)}
                {s.spawnCount > 0 && <span className="text-fg-3"> · {formatCount(s.spawnCount)} spawned</span>}
              </span>
              <LogCounts session={s} />
              <span>
                {s.status !== 'Ready' ? (
                  <span className="text-fg-3">—</span>
                ) : issues.length === 0 ? (
                  <Tooltip content="Recorded cleanly">
                    <CheckCircle2 className="h-4 w-4 text-ok/80" aria-label="Recorded cleanly" />
                  </Tooltip>
                ) : (
                  <Tooltip content={issues.join(' ')}>
                    <AlertTriangle className="h-4 w-4 text-warn" aria-label={issues.join(' ')} />
                  </Tooltip>
                )}
              </span>
              <span className="tabular text-right font-mono text-[12px] text-fg-3">{formatBytes(s.replaySizeBytes + s.rawLogSizeBytes)}</span>
              <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                <Menu
                  trigger={
                    <IconButton label="Session actions" size="sm" tooltip={false} className="opacity-60 group-hover:opacity-100">
                      <MoreHorizontal className="h-4 w-4" />
                    </IconButton>
                  }
                  items={[
                    { label: 'Open', icon: Play, onSelect: () => navigate(sessionHref(s.id)) },
                    { label: 'Copy link', icon: Link2, onSelect: () => void copyLink(s.id) },
                    {
                      label: 'Rebuild replay',
                      icon: RotateCw,
                      onSelect: () => void onRecompile(s.id),
                      disabled: s.status !== 'Ready' && s.status !== 'Failed',
                    },
                    { label: 'Delete', icon: Trash2, danger: true, separated: true, onSelect: () => setToDelete(s) },
                  ]}
                />
              </span>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title="Delete this session?"
        confirmLabel="Delete session"
        disabledReason={
          toDelete && (toDelete.status === 'Recording' || toDelete.status === 'Compiling')
            ? 'This session is still being recorded or built. Wait for it to finish.'
            : null
        }
        body={
          toDelete && (
            <p>
              The recording from <span className="text-fg">{formatDateTime(toDelete.createdAtUtc)}</span>
              {toDelete.durationSeconds > 0 && <> ({formatDuration(toDelete.durationSeconds)})</>} and its{' '}
              {formatBytes(toDelete.replaySizeBytes + toDelete.rawLogSizeBytes)} of data are deleted for good.
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

function LogCounts({ session }: { session: SessionSummary }) {
  if (session.status !== 'Ready') return <span className="text-fg-3">—</span>;
  const { errorLogCount: e, warningLogCount: w, infoLogCount: i } = session;
  if (e + w + i === 0) return <span className="text-fg-3">None</span>;
  return (
    <span className="tabular flex items-center gap-2 font-mono text-[12px]">
      {e > 0 && <span className="text-danger">{formatCount(e)} err</span>}
      {w > 0 && <span className="text-warn">{formatCount(w)} warn</span>}
      {e === 0 && w === 0 && <span className="text-fg-2">{formatCount(i)} info</span>}
    </span>
  );
}

export function SessionsEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-line-strong px-5 py-6 text-sm text-fg-2">
      <Clapperboard className="h-5 w-5 shrink-0 text-accent-bright" />
      <div>{children}</div>
    </div>
  );
}
