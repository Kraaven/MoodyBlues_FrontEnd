import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, Info, ScrollText, XCircle } from 'lucide-react';
import { LogLevel, logColorHex, type ReplayEvent, type ReplayLog } from '../../viewer/replay/replayFile';
import type { SessionDetail } from '../../lib/types';

interface LogPanelProps {
  logs: ReplayLog[];
  /** Session markers, used only for the recording health summary. */
  events: ReplayEvent[];
  session: SessionDetail;
  currentTime: number;
  onSeek: (time: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showOnScrubber: boolean;
  onShowOnScrubberChange: (show: boolean) => void;
}

const LEVELS: { level: LogLevel; label: string }[] = [
  { level: LogLevel.Info, label: 'Info' },
  { level: LogLevel.Warning, label: 'Warning' },
  { level: LogLevel.Error, label: 'Error' },
];

const MAX_ROWS = 2000;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** Index of the last log at or before `time` (logs are sorted by time). */
function lastIndexAtOrBefore(logs: ReplayLog[], time: number): number {
  let lo = 0;
  let hi = logs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (logs[mid].time <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

function LevelIcon({ level, color }: { level: LogLevel; color: string }) {
  const className = 'mt-0.5 h-3.5 w-3.5 shrink-0';
  if (level === LogLevel.Error) return <XCircle className={className} style={{ color }} />;
  if (level === LogLevel.Warning) return <AlertTriangle className={className} style={{ color }} />;
  return <Info className={className} style={{ color }} />;
}

/**
 * Right-hand panel listing the developer logs recorded with MoodyBluesLog, with level filters,
 * search, click-to-seek, a toggle for the scrubber markers, and recording health at the bottom.
 * Collapses to a thin tab on the right edge.
 */
export function LogPanel({
  logs,
  events,
  session,
  currentTime,
  onSeek,
  open,
  onOpenChange,
  showOnScrubber,
  onShowOnScrubberChange,
}: LogPanelProps) {
  const [enabled, setEnabled] = useState<Set<LogLevel>>(() => new Set([LogLevel.Info, LogLevel.Warning, LogLevel.Error]));
  const [search, setSearch] = useState('');

  const counts = useMemo(() => {
    const c = { [LogLevel.Info]: 0, [LogLevel.Warning]: 0, [LogLevel.Error]: 0 } as Record<LogLevel, number>;
    for (const log of logs) c[log.level]++;
    return c;
  }, [logs]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return logs.filter((log) => enabled.has(log.level) && (!needle || log.text.toLowerCase().includes(needle)));
  }, [logs, enabled, search]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="absolute right-0 top-0 z-10 flex h-full w-7 flex-col items-center gap-2 border-l border-hairline bg-surface/95 pt-3 text-ink-muted backdrop-blur transition hover:text-ink"
        aria-label="Show logs"
        title="Show logs"
      >
        <ScrollText className="h-4 w-4" />
        <span className="font-mono text-[10px] [writing-mode:vertical-rl]">Logs ({logs.length})</span>
        {counts[LogLevel.Error] > 0 && <XCircle className="h-3.5 w-3.5" style={{ color: logColorHex(2) }} />}
      </button>
    );
  }

  const activeIndex = lastIndexAtOrBefore(filtered, currentTime);

  // Long sessions can have many logs; show a window around the playhead.
  const windowStart = Math.max(0, Math.min(activeIndex - MAX_ROWS / 2, filtered.length - MAX_ROWS));
  const visible = filtered.slice(windowStart, windowStart + MAX_ROWS);

  const toggle = (level: LogLevel) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  return (
    <aside className="absolute right-0 top-0 z-10 flex h-full w-80 flex-col border-l border-hairline bg-surface/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">Logs</p>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded p-0.5 text-ink-muted transition hover:bg-white/5 hover:text-ink"
          aria-label="Collapse logs"
          title="Collapse"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 border-b border-hairline px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {LEVELS.map(({ level, label }) => (
            <button
              key={level}
              type="button"
              onClick={() => toggle(level)}
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] transition ${
                enabled.has(level) ? 'bg-white/10 text-ink' : 'bg-white/5 text-ink-faint line-through'
              }`}
            >
              {label} {counts[level]}
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search logs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-hairline bg-canvas px-2 py-1 font-mono text-[11px] text-ink placeholder:text-ink-faint"
        />
        <label className="flex cursor-pointer items-center gap-2 font-mono text-[10px] text-ink-muted">
          <input type="checkbox" checked={showOnScrubber} onChange={(e) => onShowOnScrubberChange(e.target.checked)} className="accent-white/70" />
          Show logs on the scrubber
        </label>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-sm text-ink-muted">
            {logs.length === 0 ? 'No logs in this session. Write them from Unity with MoodyBluesLog.' : 'No logs match the filters.'}
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {visible.map((log, i) => {
              const index = windowStart + i;
              const color = logColorHex(log.color);
              return (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => onSeek(log.time)}
                    className={`flex w-full gap-2 px-3 py-2 text-left transition hover:bg-white/5 ${index === activeIndex ? 'bg-white/5' : ''}`}
                  >
                    <LevelIcon level={log.level} color={color} />
                    <div className="min-w-0 flex-1">
                      <span className="block font-mono text-[10px] tabular-nums text-ink-faint">{formatTime(log.time)}</span>
                      <span className="block max-h-40 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px]" style={{ color }}>
                        {log.text || '(empty)'}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {filtered.length > MAX_ROWS && (
          <p className="px-3 py-2 font-mono text-[10px] text-ink-faint">
            Showing {MAX_ROWS} of {filtered.length} logs around the playhead.
          </p>
        )}
      </div>

      <RecordingHealth events={events} session={session} />
    </aside>
  );
}

function RecordingHealth({ events, session }: { events: ReplayEvent[]; session: SessionDetail }) {
  const { dataGaps, reconnects } = useMemo(() => {
    let gaps = 0;
    let recon = 0;
    for (const e of events) {
      if (e.type === 'DataGap') gaps++;
      else if (e.type === 'Connected' && e.a > 0) recon++;
    }
    return { dataGaps: gaps, reconnects: recon };
  }, [events]);

  const rows: { ok: boolean; label: string; detail?: string }[] = [
    {
      ok: session.endedCleanly,
      label: session.endedCleanly ? 'Ended cleanly' : 'Did not end cleanly',
      detail: session.endedCleanly ? undefined : 'The game stopped streaming without ending the session (crash, kill or lost connection). The end may be missing.',
    },
    {
      ok: session.hardClamps === 0,
      label: `${session.hardClamps} hard clamp${session.hardClamps === 1 ? '' : 's'}`,
      detail: session.hardClamps > 0 ? 'Some transforms exceeded the configured ranges and are wrong. Raise the ranges in the scene config.' : undefined,
    },
    {
      ok: session.droppedEvents === 0,
      label: `${session.droppedEvents} dropped event${session.droppedEvents === 1 ? '' : 's'}`,
      detail: session.droppedEvents > 0 ? 'The client dropped events because the connection could not keep up.' : undefined,
    },
    {
      ok: dataGaps === 0,
      label: `${dataGaps} data gap${dataGaps === 1 ? '' : 's'}`,
      detail: dataGaps > 0 ? 'Messages the server rejected; their data is missing from the replay.' : undefined,
    },
    { ok: reconnects === 0, label: `${reconnects} reconnect${reconnects === 1 ? '' : 's'}` },
  ];

  return (
    <div className="shrink-0 space-y-1 border-t border-hairline px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">Recording health</p>
      {rows.map((row) => (
        <div key={row.label} className="flex items-start gap-2" title={row.detail}>
          {row.ok ? (
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400/80" />
          ) : (
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-300" />
          )}
          <div className="min-w-0">
            <p className={`font-mono text-[11px] ${row.ok ? 'text-ink-muted' : 'text-amber-200/90'}`}>{row.label}</p>
            {!row.ok && row.detail && <p className="text-[10px] leading-snug text-ink-faint">{row.detail}</p>}
          </div>
        </div>
      ))}
      {session.errorMessage && (
        <div className="flex items-start gap-2">
          <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
          <p className="text-[10px] leading-snug text-red-300/90">{session.errorMessage}</p>
        </div>
      )}
    </div>
  );
}
