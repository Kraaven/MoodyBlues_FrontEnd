import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clapperboard, Link2, MoreHorizontal, Play, RotateCw, Trash2 } from 'lucide-react';
import type { SessionSummary } from '../../api/types';
import { useDeleteSession, useRecompileSession } from '../../api/queries';
import { errorText } from '../../api/client';
import { ActivityGlyph } from '../../ui/ActivityGlyph';
import { SessionStatusChip } from '../../ui/Chip';
import { ConfirmDialog } from '../../ui/Dialog';
import { IconButton } from '../../ui/Button';
import { Menu } from '../../ui/Menu';
import { Tooltip } from '../../ui/Tooltip';
import { useToast } from '../../ui/Toast';
import { cn } from '../../ui/cn';
import { formatBytes, formatCount, formatDateTime, formatDuration, formatRecorded } from '../../lib/format';
import { useGlyphTimelines } from './glyphs';

/** Problems worth flagging next to a session (DESIGN.md 7.5). */
function healthIssues(s: SessionSummary): string[] {
  const issues: string[] = [];
  if (s.status === 'Ready' && !s.endedCleanly) issues.push('Did not end cleanly: the end of the recording may be missing.');
  return issues;
}

/**
 * Sessions as a reel (DESIGN.md 7.5): each row leads with its status, when it was recorded and how
 * long it ran, and carries the shape of the session instead of columns of repeated numbers. The
 * whole row opens the player.
 */
export function SessionReel({ sessions, sessionHref }: { sessions: SessionSummary[]; sessionHref: (id: string) => string }) {
  const navigate = useNavigate();
  const notify = useToast();
  const recompile = useRecompileSession();
  const remove = useDeleteSession();
  const [toDelete, setToDelete] = useState<SessionSummary | null>(null);
  const timelines = useGlyphTimelines(sessions);

  // Live recordings first (DESIGN.md 7.5), otherwise newest first as the API returns them.
  const rows = [...sessions].sort((a, b) => Number(b.status === 'Recording') - Number(a.status === 'Recording'));
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

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-rule bg-ink-1/85 backdrop-blur-sm">
      <ul aria-label="Sessions">
        {rows.map((s, i) => {
          const issues = healthIssues(s);
          return (
            <li
              key={s.id}
              tabIndex={0}
              onClick={() => navigate(sessionHref(s.id))}
              onKeyDown={(e) => e.key === 'Enter' && e.target === e.currentTarget && navigate(sessionHref(s.id))}
              style={{ animationDelay: `${Math.min(i, 8) * 20}ms` }}
              className={cn(
                'group animate-rise cursor-pointer border-b border-rule px-4 py-3 last:border-b-0',
                'transition-colors duration-[120ms] hover:bg-ink-2/90 focus-visible:bg-ink-2/90 focus-visible:outline-none',
              )}
            >
              <div className="flex items-center gap-3">
                <div className="w-[148px] min-w-0 shrink-0">
                  <SessionStatusChip status={s.status} />
                </div>
                <div className="min-w-0 flex-1">
                  <Tooltip content={formatDateTime(s.createdAtUtc)}>
                    <p className="w-fit text-[13px] text-fg">{formatRecorded(s.createdAtUtc)}</p>
                  </Tooltip>
                  <p className="tabular font-mono text-[12px] text-fg-3">{s.status === 'Ready' || s.durationSeconds > 0 ? formatDuration(s.durationSeconds) : '—'}</p>
                </div>
                <div className="hidden sm:block">
                  <ActivityGlyph session={s} longestSeconds={longest} timeline={timelines.get(s.id)} />
                </div>
                <span onClick={(e) => e.stopPropagation()}>
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

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-0 text-[12px] sm:pl-[160px]">
                {s.status === 'Failed' && s.errorMessage ? (
                  <p className="min-w-0 truncate text-[#ff9b9b]" title={s.errorMessage}>
                    {s.errorMessage}
                  </p>
                ) : (
                  <>
                    <span className="tabular font-mono text-fg-3">
                      {formatCount(s.objectCount)} objects
                      {s.spawnCount > 0 && ` · ${formatCount(s.spawnCount)} spawned`}
                    </span>
                    <LogCounts session={s} />
                    {s.status === 'Ready' &&
                      (issues.length === 0 ? (
                        <Tooltip content="Recorded cleanly">
                          <CheckCircle2 className="h-3.5 w-3.5 text-ok/80" aria-label="Recorded cleanly" />
                        </Tooltip>
                      ) : (
                        <Tooltip content={issues.join(' ')}>
                          <AlertTriangle className="h-3.5 w-3.5 text-caution" aria-label={issues.join(' ')} />
                        </Tooltip>
                      ))}
                    <span className="tabular ml-auto font-mono text-fg-3">{formatBytes(s.replaySizeBytes + s.rawLogSizeBytes)}</span>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

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
  if (session.status !== 'Ready') return null;
  const { errorLogCount: e, warningLogCount: w, infoLogCount: i } = session;
  if (e + w + i === 0) return <span className="text-fg-3">No logs</span>;
  return (
    <span className="tabular flex items-center gap-2 font-mono">
      {e > 0 && <span className="text-danger">{formatCount(e)} err</span>}
      {w > 0 && <span className="text-caution">{formatCount(w)} warn</span>}
      {e === 0 && w === 0 && <span className="text-fg-2">{formatCount(i)} info</span>}
    </span>
  );
}

export function SessionsEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-rule-strong bg-ink-1/70 px-5 py-6 text-sm text-fg-2 backdrop-blur-sm">
      <Clapperboard className="h-5 w-5 shrink-0 text-blue-bright" />
      <div>{children}</div>
    </div>
  );
}
