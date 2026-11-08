import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, RotateCw, Trash2, XCircle } from 'lucide-react';
import type { SessionDetail } from '../api/types';
import { saveDownload, useDeleteSession, useRecompileSession } from '../api/queries';
import { errorText } from '../api/client';
import type { Replay } from '../viewer/replay/replayFile';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/Dialog';
import { SectionLabel } from '../ui/States';
import { useToast } from '../ui/Toast';
import { formatBytes, formatCount, formatDateTime, formatDuration, plural } from '../lib/format';
import { useState } from 'react';

interface HealthRow {
  ok: boolean;
  label: string;
  detail?: string;
}

// eslint-disable-next-line react-refresh/only-export-components
export function healthRows(session: SessionDetail, replay: Replay | null): HealthRow[] {
  let gaps = 0;
  let reconnects = 0;
  for (const e of replay?.events ?? []) {
    if (e.type === 'DataGap') gaps++;
    else if (e.type === 'Connected' && e.a > 0) reconnects++;
  }
  return [
    {
      ok: session.endedCleanly,
      label: session.endedCleanly ? 'Ended cleanly' : 'Did not end cleanly',
      detail: session.endedCleanly ? undefined : 'The game stopped streaming without ending the session (crash, kill or lost connection). The end may be missing.',
    },
    {
      ok: session.hardClamps === 0,
      label: plural(session.hardClamps, 'hard clamp'),
      detail: session.hardClamps > 0 ? 'Some transforms were outside the configured ranges and are wrong. Raise the ranges in the scene config.' : undefined,
    },
    {
      ok: session.droppedEvents === 0,
      label: plural(session.droppedEvents, 'dropped event'),
      detail: session.droppedEvents > 0 ? 'The client dropped events because the connection could not keep up.' : undefined,
    },
    {
      ok: gaps === 0,
      label: plural(gaps, 'data gap'),
      detail: gaps > 0 ? 'Messages the server rejected; their data is missing from the replay.' : undefined,
    },
    { ok: reconnects === 0, label: plural(reconnects, 'reconnect') },
  ];
}

export function DetailsTab({ session, replay, sceneHref, sessionsHref }: { session: SessionDetail; replay: Replay | null; sceneHref: string; sessionsHref: string }) {
  const rows = useMemo(() => healthRows(session, replay), [session, replay]);
  const recompile = useRecompileSession();
  const remove = useDeleteSession();
  const notify = useToast();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  const facts: [string, string][] = [
    ['Recorded', formatDateTime(session.createdAtUtc)],
    ['Duration', formatDuration(session.durationSeconds)],
    ['Objects', formatCount(session.objectCount)],
    ['Spawns', formatCount(session.spawnCount)],
    ['Keyframes', formatCount(session.keyframeCount)],
    ['Replay size', formatBytes(session.replaySizeBytes)],
    ['Raw log size', formatBytes(session.rawLogSizeBytes)],
    ['Connections', formatCount(session.connectionCount)],
    ['Compiler', session.compilerVersion ? `v${session.compilerVersion}` : '—'],
  ];

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
      <section className="space-y-2">
        <SectionLabel>Recording health</SectionLabel>
        {rows.map((row) => (
          <div key={row.label} className="flex items-start gap-2.5">
            {row.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok/80" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />}
            <div className="min-w-0">
              <p className={row.ok ? 'text-[13px] text-fg-2' : 'text-[13px] text-fg'}>{row.label}</p>
              {!row.ok && row.detail && <p className="text-[12px] leading-4 text-fg-3">{row.detail}</p>}
            </div>
          </div>
        ))}
        {session.errorMessage && (
          <div className="flex items-start gap-2.5">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-[13px] text-[#ffb3b3]">{session.errorMessage}</p>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <SectionLabel>Session</SectionLabel>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-fg-3">{k}</dt>
              <dd className="tabular text-right text-fg">{v}</dd>
            </div>
          ))}
          <dt className="text-fg-3">Scene</dt>
          <dd className="text-right">
            <Link to={sceneHref} className="text-accent-bright hover:underline">
              Open scene
            </Link>
          </dd>
        </dl>
        <p className="break-all pt-1 font-mono text-[11px] text-fg-3" title="Scene version hash">
          {session.sceneHash}
        </p>
      </section>

      <section className="space-y-2">
        <SectionLabel>Actions</SectionLabel>
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            size="sm"
            loading={recompile.isPending}
            disabled={session.status !== 'Ready' && session.status !== 'Failed'}
            onClick={async () => {
              try {
                await recompile.mutateAsync(session.id);
                notify('Rebuilding the replay.');
              } catch (err) {
                notify(errorText(err), 'error');
              }
            }}
          >
            <RotateCw className="h-4 w-4" />
            Rebuild replay
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={session.status !== 'Ready'}
            onClick={() => saveDownload(`/api/sessions/${encodeURIComponent(session.id)}/replay`, `session-${session.id}.mbr`).catch((err) => notify(errorText(err), 'error'))}
          >
            <Download className="h-4 w-4" />
            Download replay
          </Button>
          <Button variant="secondary" size="sm" className="text-danger!" onClick={() => setDeleting(true)}>
            <Trash2 className="h-4 w-4" />
            Delete session
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this session?"
        confirmLabel="Delete session"
        disabledReason={session.status === 'Recording' || session.status === 'Compiling' ? 'This session is still being recorded or built. Wait for it to finish.' : null}
        body={
          <p>
            The recording from <span className="text-fg">{formatDateTime(session.createdAtUtc)}</span> and its{' '}
            {formatBytes(session.replaySizeBytes + session.rawLogSizeBytes)} of data are deleted for good.
          </p>
        }
        onConfirm={async () => {
          await remove.mutateAsync(session.id);
          notify('Session deleted.');
          navigate(sessionsHref);
        }}
      />
    </div>
  );
}
