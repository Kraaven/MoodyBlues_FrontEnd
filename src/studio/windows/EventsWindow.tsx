import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { LogLevel, logColorHex, type Replay, type ReplayEvent } from '../../viewer/replay/replayFile';
import { lastIndexAtOrBefore } from '../../player/logNav';
import { usePlaybackState, usePlaybackTime, type Playback } from '../../player/playback';
import { FilterTabs } from '../../ui/Tabs';
import { cn } from '../../ui/cn';
import { formatPlayhead } from '../../lib/format';
import { useStudio } from '../studioStore';
import { SearchField } from './parts';

type Filter = 'all' | 'warnings' | 'errors' | 'events';

export interface Entry {
  time: number;
  tag: string;
  tone: 'log' | 'warn' | 'error' | 'event';
  title: string;
  detail: string | null;
  /** The developer's own LogColor, for info logs that set one. */
  color: string | null;
  objectId: number | null;
  level: LogLevel | null;
}

const EVENT_TEXT: Partial<Record<ReplayEvent['type'], { tag: string; title: (name: string) => string }>> = {
  Spawn: { tag: 'Spawn', title: (n) => `${n} spawned` },
  Delete: { tag: 'Delete', title: (n) => `${n} destroyed` },
  Disconnected: { tag: 'Offline', title: () => 'Connection lost' },
  Connected: { tag: 'Online', title: () => 'Reconnected' },
  DataGap: { tag: 'Gap', title: () => 'Data missing here' },
  SessionEnded: { tag: 'End', title: () => 'Session ended' },
};

/** Logs and the replay's own events (spawns, deletes, disconnects, gaps), as one list in time order. */
// oxlint-disable-next-line react/only-export-components
export function buildEntries(replay: Replay, nameOf: (id: number) => string): Entry[] {
  const out: Entry[] = replay.logs.map((log) => {
    const [first, ...rest] = (log.text || '(empty)').split('\n');
    const tone = log.level === LogLevel.Error ? 'error' : log.level === LogLevel.Warning ? 'warn' : 'log';
    return {
      time: log.time,
      tag: tone === 'error' ? 'Error' : tone === 'warn' ? 'Warn' : 'Log',
      tone,
      title: first,
      detail: rest.join('\n').trim() || null,
      color: tone === 'log' && log.color > 1 ? logColorHex(log.color) : null,
      objectId: null,
      level: log.level,
    };
  });
  for (const e of replay.events) {
    const text = EVENT_TEXT[e.type];
    if (!text) continue;
    if (e.type === 'Connected' && e.a === 0) continue; // the first connection is the start, not news
    out.push({
      time: e.time,
      tag: text.tag,
      tone: 'event',
      title: text.title(e.objectId ? nameOf(e.objectId) : 'Object'),
      detail: e.objectId ? `#${e.objectId}` : null,
      color: null,
      objectId: e.objectId || null,
      level: null,
    });
  }
  return out.sort((a, b) => a.time - b.time);
}

/** Events & logs: what the game said and did, following the playhead, every row a seek. */
export function EventsWindow({ replay, playback, label }: { replay: Replay; playback: Playback; label: string }) {
  const player = useStudio((s) => s.player);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [follow, setFollow] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const time = usePlaybackTime(playback, 8);
  const { playing } = usePlaybackState(playback);

  const entries = useMemo(() => buildEntries(replay, (id) => player?.nameOf(id) ?? `Object ${id}`), [replay, player]);
  const counts = useMemo(() => {
    let warnings = 0;
    let errors = 0;
    let events = 0;
    for (const e of entries) {
      if (e.tone === 'warn') warnings++;
      else if (e.tone === 'error') errors++;
      else if (e.tone === 'event') events++;
    }
    return { all: entries.length - events, warnings, errors, events };
  }, [entries]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter === 'all' && e.tone === 'event') return false;
      if (filter === 'warnings' && e.tone !== 'warn') return false;
      if (filter === 'errors' && e.tone !== 'error') return false;
      if (filter === 'events' && e.tone !== 'event') return false;
      return !needle || e.title.toLowerCase().includes(needle) || (e.detail?.toLowerCase().includes(needle) ?? false);
    });
  }, [entries, filter, search]);

  const active = lastIndexAtOrBefore(shown, time);
  const virtualizer = useVirtualizer({ count: shown.length, getScrollElement: () => scrollRef.current, estimateSize: () => 96, overscan: 8 });

  useEffect(() => {
    if (follow && playing && active >= 0) virtualizer.scrollToIndex(active, { align: 'center' });
  }, [follow, playing, active, virtualizer]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-4 px-6 pt-5">
        <p className="truncate font-mono text-[14px] text-fg-2">{label}</p>
        <FilterTabs
          value={filter}
          onChange={setFilter}
          items={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'warnings', label: 'Warnings', count: counts.warnings },
            { id: 'errors', label: 'Errors', count: counts.errors },
            { id: 'events', label: 'Events', count: counts.events },
          ]}
        />
        {entries.length > 12 && <SearchField value={search} onChange={setSearch} placeholder="Search logs" />}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {shown.length === 0 ? (
          <p className="px-3 py-4 text-[14px] leading-6 text-fg-2">
            {entries.length === 0 ? (
              <>
                No logs in this session. Write them from Unity with <span className="font-mono text-[13px] text-fg">MoodyBluesLog.Info</span>, Warning or Error.
              </>
            ) : (
              'Nothing matches.'
            )}
          </p>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const entry = shown[item.index];
              const isOpen = expanded.has(item.index);
              const now = item.index === active;
              const past = entry.time <= time;
              return (
                <div key={item.key} ref={virtualizer.measureElement} data-index={item.index} className="absolute left-0 right-0" style={{ transform: `translateY(${item.start}px)` }}>
                  <button
                    type="button"
                    onClick={() => {
                      playback.seek(entry.time);
                      if (entry.objectId !== null && player) useStudio.getState().selectId(entry.objectId);
                    }}
                    className={cn(
                      'relative w-full rounded-[8px] px-3 py-3 text-left transition-colors duration-[120ms] hover:bg-ink-3/70',
                      now && 'bg-ink-3/80',
                      !past && 'opacity-55',
                    )}
                  >
                    {now && <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[2px] rounded-full bg-accent" />}
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="tabular font-mono text-[13px] text-fg-3">{formatPlayhead(entry.time, 3)}</span>
                      <span
                        className={cn(
                          'font-mono text-[12px] uppercase tracking-[0.04em]',
                          entry.tone === 'error' ? 'text-danger' : entry.tone === 'warn' ? 'text-accent' : entry.tone === 'event' ? 'text-work' : 'text-fg',
                        )}
                      >
                        {entry.tag}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'mt-1.5 flex items-start gap-2 break-words text-[16px] leading-6',
                        entry.tone === 'error' ? 'text-danger-soft' : entry.tone === 'warn' ? 'text-accent' : 'text-fg',
                        !isOpen && 'line-clamp-2',
                      )}
                    >
                      {entry.color && <span aria-hidden="true" className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: entry.color }} />}
                      {entry.title}
                    </span>
                    {entry.detail && (
                      <span className={cn('mt-1 block whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-fg-3', !isOpen && 'line-clamp-2')}>{entry.detail}</span>
                    )}
                    {(entry.detail?.split('\n').length ?? 0) > 2 && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.index)) next.delete(item.index);
                            else next.add(item.index);
                            return next;
                          });
                        }}
                        className="mt-1 inline-block font-mono text-[11px] uppercase tracking-[0.06em] text-accent hover:text-accent-hover"
                      >
                        {isOpen ? 'Less' : 'More'}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-rule px-6 py-3.5">
        <span className="text-[15px] text-fg-2">Follow playhead</span>
        <button type="button" aria-pressed={follow} onClick={() => setFollow((f) => !f)} className={cn('text-[15px] transition-colors', follow ? 'text-accent' : 'text-fg-3 hover:text-fg-2')}>
          {follow ? 'On' : 'Off'}
        </button>
      </div>
    </div>
  );
}
