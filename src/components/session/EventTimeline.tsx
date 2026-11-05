import { useMemo, useState } from 'react';
import type { SessionEvent, SessionEventType } from '../../viewer/session/eventLog';

interface EventTimelineProps {
  events: SessionEvent[];
  currentTime: number;
  onSeek: (time: number) => void;
  onClose?: () => void;
}

const EVENT_TYPES: SessionEventType[] = ['Spawn', 'Show', 'Hide', 'Delete'];

const TYPE_STYLES: Record<SessionEventType, string> = {
  Spawn: 'bg-emerald-500/20 text-emerald-300',
  Show: 'bg-sky-500/20 text-sky-300',
  Hide: 'bg-zinc-500/20 text-zinc-300',
  Delete: 'bg-red-500/20 text-red-300',
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

export function EventTimeline({ events, currentTime, onSeek, onClose }: EventTimelineProps) {
  const [enabledTypes, setEnabledTypes] = useState<Set<SessionEventType>>(() => new Set(EVENT_TYPES));
  const [objectFilter, setObjectFilter] = useState('');

  const filtered = useMemo(() => {
    const filterNum = objectFilter.trim() ? Number(objectFilter) : null;
    return events.filter((e) => {
      if (!enabledTypes.has(e.type)) return false;
      if (filterNum != null && !Number.isNaN(filterNum) && e.objectId !== filterNum) return false;
      return true;
    });
  }, [events, enabledTypes, objectFilter]);

  const activeIndex = useMemo(() => {
    let best = -1;
    for (let i = 0; i < filtered.length; i++) {
      if (filtered[i].time <= currentTime) best = i;
      else break;
    }
    return best;
  }, [filtered, currentTime]);

  const toggleType = (type: SessionEventType) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
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
          {EVENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => toggleType(type)}
              className={`rounded-full px-2 py-0.5 font-mono text-[10px] transition ${
                enabledTypes.has(type) ? TYPE_STYLES[type] : 'bg-white/5 text-ink-faint'
              }`}
            >
              {type}
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
          <p className="px-3 py-4 text-sm text-ink-muted">No lifecycle events in this session.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {filtered.map((event, index) => (
              <li key={`${event.time}-${event.type}-${event.objectId}-${index}`}>
                <button
                  type="button"
                  onClick={() => onSeek(event.time)}
                  className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition hover:bg-white/5 ${
                    index === activeIndex ? 'bg-white/5' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${TYPE_STYLES[event.type]}`}>
                      {event.type}
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-ink-faint">
                      {formatTime(event.time)}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-ink-muted">object {event.objectId}</span>
                  {'templateObjectId' in event && (
                    <span className="font-mono text-[10px] text-ink-faint">
                      template {event.templateObjectId}
                      {event.parentObjectId ? ` · parent ${event.parentObjectId}` : ''}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
