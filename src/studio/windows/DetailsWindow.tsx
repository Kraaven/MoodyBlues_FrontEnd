import { useMemo } from 'react';
import { CheckCircle2, TriangleAlert, XCircle } from 'lucide-react';
import type { SharedSessionDetail } from '../../api/types';
import type { Replay } from '../../viewer/replay/replayFile';
import { SessionStatusLabel } from '../../ui/Chip';
import { formatBytes, formatCount, formatDateTime, formatDuration, plural } from '../../lib/format';
import { Row, Rule, SectionTitle, WindowBody } from './parts';

interface HealthRow {
  ok: boolean;
  label: string;
  detail?: string;
}

function healthRows(session: SharedSessionDetail, replay: Replay | null): HealthRow[] {
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
      detail: session.endedCleanly ? undefined : 'The game stopped streaming without ending the session (a crash, a kill or a lost connection). The end may be missing.',
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
    { ok: gaps === 0, label: plural(gaps, 'data gap'), detail: gaps > 0 ? 'Messages the server rejected; their data is missing from the replay.' : undefined },
    { ok: reconnects === 0, label: plural(reconnects, 'reconnect') },
  ];
}

/** Recording health and the session's facts. Read only, for owners and shared views alike. */
export function DetailsWindow({ session, replay }: { session: SharedSessionDetail; replay: Replay | null }) {
  const rows = useMemo(() => healthRows(session, replay), [session, replay]);

  return (
    <WindowBody>
      <div className="flex items-center justify-between">
        <SectionTitle className="mb-0">Recording health</SectionTitle>
        <SessionStatusLabel status={session.status} />
      </div>
      <ul className="mt-4 space-y-3">
        {rows.map((row) => (
          <li key={row.label} className="flex items-start gap-3">
            {row.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-caution" />}
            <div className="min-w-0">
              <p className={row.ok ? 'text-[14px] text-fg-2' : 'text-[14px] text-fg'}>{row.label}</p>
              {!row.ok && row.detail && <p className="mt-0.5 text-[13px] leading-5 text-fg-3">{row.detail}</p>}
            </div>
          </li>
        ))}
        {session.errorMessage && (
          <li className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-[14px] text-danger-soft">{session.errorMessage}</p>
          </li>
        )}
      </ul>
      <Rule />
      <SectionTitle>Session</SectionTitle>
      <dl>
        <Row label="Recorded">{formatDateTime(session.createdAtUtc)}</Row>
        <Row label="Duration">{formatDuration(session.durationSeconds)}</Row>
        <Row label="Objects">{formatCount(session.objectCount)}</Row>
        <Row label="Spawns">{formatCount(session.spawnCount)}</Row>
        <Row label="Keyframes">{formatCount(session.keyframeCount)}</Row>
        <Row label="Replay size">{formatBytes(session.replaySizeBytes)}</Row>
        <Row label="Raw log size">{formatBytes(session.rawLogSizeBytes)}</Row>
        <Row label="Connections">{formatCount(session.connectionCount)}</Row>
        <Row label="Rotation widenings">{formatCount(session.rotationWidenings)}</Row>
        <Row label="Compiler">{session.compilerVersion ? `v${session.compilerVersion}` : '—'}</Row>
      </dl>
      <p className="mt-3 break-all font-mono text-[11px] text-fg-3" title="Scene version hash">
        {session.sceneHash}
      </p>
    </WindowBody>
  );
}
