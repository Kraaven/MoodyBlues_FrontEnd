import { useMemo, useState } from 'react';
import type { ReplayEvent } from '../../viewer/replay/replayFile';

interface EventTimelineProps {
  events: ReplayEvent[];
  currentTime: number;
  onSeek: (time: number) => void;
  onClose?: () => void;
}

/** Filter groups shown as chips. "Session" covers connection markers and data gaps. */
type FilterGroup = 'Spawn' | 'Delete' | 'Show' | 'Hide' | 'Reparent' | 'Session';

const FILTER_GROUPS: FilterGroup[] = ['Spawn', 'Delete', 'Show', 'Hide', 'Reparent', 'Session'];

const GROUP_STYLES: Record<FilterGroup, string> = {
  Spawn: 'bg-emerald-500/20 text-emerald-300',
  Delete: 'bg-red-500/20 text-red-300',
  Show: 'bg-sky-500/20 text-sky-300',
  Hide: 'bg-zinc-500/20 text-zinc-300',
  Reparent: 'bg-violet-500/20 text-violet-300',
  Session: 'bg-amber-500/20 text-amber-300',
};

const DISCONNECT_REASONS = ['client closed', 'timed out', 'error', 'server shutdown'];
const END_REASONS = ['stopped by host', 'application quit', 'scene unloaded', 'client error'];

function groupOf(event: ReplayEvent): FilterGroup {
  switch (event.type) {
    case 'Spawn':
    case 'Delete':
    case 'Show':
    case 'Hide':
    case 'Reparent':
      return event.type;
    default:
      return 'Session';
  }
}

function describe(event: ReplayEvent): string {
  switch (event.type) {
    case 'Spawn':
      return `object ${event.objectId} from template ${event.a}${event.b ? ` under ${event.b}` : ''}`;
    case 'Reparent':
      return `object ${event.objectId} moved under ${event.a === 0 ? 'scene root' : `object ${event.a}`}`;
    case 'Delete':
    case 'Show':
    case 'Hide':
      return `object ${event.objectId}`;
    case 'Connected':
      return event.a === 0 ? 'Recording started' : `Reconnected (connection ${event.a + 1})`;
    case 'Disconnected':
      return `Connection ended (${DISCONNECT_REASONS[event.aux] ?? 'unknown'})`;
    case 'SessionEnded':
      return `Session ended (${END_REASONS[event.aux] ?? 'unknown'})`;
    case 'DataGap':
      return 'Data missing here (a message was rejected)';
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** Index of the last event at or before `time` (events are sorted by time). */
function lastIndexAtOrBefore(events: ReplayEvent[], time: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].time <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

const MAX_ROWS = 2000;

export function EventTimeline({ events, currentTime, onSeek, onClose }: EventTimelineProps) {
  const [enabled, setEnabled] = useState<Set<FilterGroup>>(() => new Set(FILTER_GROUPS));
  const [objectFilter, setObjectFilter] = useState('');

  const filtered = useMemo(() => {
    const id = objectFilter.trim() ? Number(objectFilter) : null;
    return events.filter((e) => {
      if (!enabled.has(groupOf(e))) return false;
      if (id != null && !Number.isNaN(id) && e.objectId !== id && e.a !== id) return false;
      return true;
    });
  }, [events, enabled, objectFilter]);

  const activeIndex = lastIndexAtOrBefore(filtered, currentTime);

  // Long sessions can have tens of thousands of events; show a window around the playhead.
  const windowStart = Math.max(0, Math.min(activeIndex - MAX_ROWS / 2, filtered.length - MAX_ROWS));
  const visible = filtered.slice(windowStart, windowStart + MAX_ROWS);

  const toggle = (group: FilterGroup) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  return (
    <aside className="absolute right-0 top-0 z-10 flex h-full w-72 flex-col border-l border-hairline bg-surface/95 backdrop-blur">
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">Event timeline</p>
        {onClose && (
          <button type="button" onClick={onClose} className="text-xs text-ink-muted hover:text-ink">
            Close
          </button>
        )}
      </div>

      <div className="space-y-2 border-b border-hairline px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {FILTER_GROUPS.map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => toggle(group)}
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] transition ${
                enabled.has(group) ? GROUP_STYLES[group] : 'bg-white/5 text-ink-faint'
              }`}
            >
              {group}
            </button>
          ))}
        </div>
        <input
          type="text"
          inputMode="numeric"
          placeholder="Filter by object ID"
          value={objectFilter}
          onChange={(e) => setObjectFilter(e.target.value)}
          className="w-full rounded-md border border-hairline bg-canvas px-2 py-1 font-mono text-[11px] text-ink placeholder:text-ink-faint"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-sm text-ink-muted">
            {events.length === 0 ? 'No events in this session.' : 'No events match the filters.'}
          </p>
        ) : (
          <ul className="divide-y divide-hairline">
            {visible.map((event, i) => {
              const index = windowStart + i;
              const group = groupOf(event);
              return (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => onSeek(event.time)}
                    className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition hover:bg-white/5 ${
                      index === activeIndex ? 'bg-white/5' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${GROUP_STYLES[group]}`}>
                        {group === 'Session' ? event.type : group}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-ink-faint">{formatTime(event.time)}</span>
                    </div>
                    <span className="font-mono text-[11px] text-ink-muted">{describe(event)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {filtered.length > MAX_ROWS && (
          <p className="px-3 py-2 font-mono text-[10px] text-ink-faint">
            Showing {MAX_ROWS} of {filtered.length} events around the playhead.
          </p>
        )}
      </div>
    </aside>
  );
}
