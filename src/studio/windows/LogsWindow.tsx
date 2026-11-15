import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Info, OctagonX, TriangleAlert } from 'lucide-react';
import { LogLevel, logColorHex, type Replay } from '../../viewer/replay/replayFile';
import { lastIndexAtOrBefore } from '../logNav';
import { usePlaybackState, usePlaybackTime, type Playback } from '../playback';
import { FilterTabs } from '../../ui/Tabs';
import { cn } from '../../ui/cn';
import { formatPlayhead } from '../../lib/format';
import { SearchField } from './parts';

type Filter = 'all' | 'info' | 'warnings' | 'errors';

interface Row {
  /** Index into replay.logs: stable across filtering and searching. */
  id: number;
  time: number;
  level: number;
  color: string;
  title: string;
  detail: string | null;
  search: string;
}

const LEVEL = {
  [LogLevel.Info]: { label: 'Info', Icon: Info },
  [LogLevel.Warning]: { label: 'Warning', Icon: TriangleAlert },
  [LogLevel.Error]: { label: 'Error', Icon: OctagonX },
} as const;

const FILTER_LEVEL: Record<Exclude<Filter, 'all'>, number> = { info: LogLevel.Info, warnings: LogLevel.Warning, errors: LogLevel.Error };

function buildRows(replay: Replay): Row[] {
  return replay.logs.map((log, id) => {
    const [first, ...rest] = (log.text || '(empty)').split('\n');
    const detail = rest.join('\n').trim() || null;
    return { id, time: log.time, level: log.level, color: logColorHex(log.color), title: first, detail, search: `${first}\n${detail ?? ''}`.toLowerCase() };
  });
}

/** Logs: what the game wrote with MoodyBluesLog, following the playhead; a row seeks to its moment. */
export function LogsWindow({ replay, playback, label }: { replay: Replay; playback: Playback; label: string }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [follow, setFollow] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const time = usePlaybackTime(playback, 8);
  const { playing } = usePlaybackState(playback);

  const rows = useMemo(() => buildRows(replay), [replay]);
  const counts = useMemo(() => {
    const c = { all: rows.length, info: 0, warnings: 0, errors: 0 };
    for (const r of rows) {
      if (r.level === LogLevel.Error) c.errors++;
      else if (r.level === LogLevel.Warning) c.warnings++;
      else c.info++;
    }
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => (filter === 'all' || r.level === FILTER_LEVEL[filter]) && (!needle || r.search.includes(needle)));
  }, [rows, filter, search]);

  const active = lastIndexAtOrBefore(shown, time);
  const virtualizer = useVirtualizer({ count: shown.length, getScrollElement: () => scrollRef.current, estimateSize: () => 96, overscan: 8 });

  useEffect(() => {
    if (follow && playing && active >= 0) virtualizer.scrollToIndex(active, { align: 'center' });
  }, [follow, playing, active, virtualizer]);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-4 px-6 pt-5">
        <p className="truncate font-mono text-[14px] text-fg-2">{label}</p>
        <FilterTabs
          value={filter}
          onChange={setFilter}
          items={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'info', label: 'Info', count: counts.info },
            { id: 'warnings', label: 'Warnings', count: counts.warnings },
            { id: 'errors', label: 'Errors', count: counts.errors },
          ]}
        />
        {rows.length > 0 && <SearchField value={search} onChange={setSearch} placeholder="Search logs" />}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {shown.length === 0 ? (
          <p className="px-3 py-4 text-[14px] leading-6 text-fg-2">
            {rows.length === 0 ? (
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
              const row = shown[item.index];
              const open = expanded.has(row.id);
              const now = item.index === active;
              const past = row.time <= time;
              const { label: levelLabel, Icon } = LEVEL[row.level as keyof typeof LEVEL] ?? LEVEL[LogLevel.Info];
              const long = row.detail !== null && row.detail.split('\n').length > 2;
              return (
                <div key={item.key} ref={virtualizer.measureElement} data-index={item.index} className="absolute left-0 right-0" style={{ transform: `translateY(${item.start}px)` }}>
                  <div className={cn('relative rounded-[8px] transition-colors duration-[120ms] hover:bg-ink-3/70', now && 'bg-ink-3/80', !past && 'opacity-55')}>
                    <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-full" style={{ background: row.color }} />
                    <button type="button" onClick={() => playback.seek(row.time)} className="block w-full rounded-[8px] px-4 py-3 text-left">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="tabular font-mono text-[13px] text-fg-3">{formatPlayhead(row.time, 3)}</span>
                        <span className="flex items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.04em]" style={{ color: row.color }}>
                          <Icon aria-hidden="true" className="h-3.5 w-3.5" />
                          {levelLabel}
                        </span>
                      </span>
                      <span className={cn('mt-1.5 block break-words text-[16px] leading-6 text-fg', !open && 'line-clamp-2')}>{row.title}</span>
                      {row.detail && <span className={cn('mt-1 block whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-fg-3', !open && 'line-clamp-2')}>{row.detail}</span>}
                    </button>
                    {long && (
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => toggle(row.id)}
                        className="mb-2 ml-4 font-mono text-[11px] uppercase tracking-[0.06em] text-accent hover:text-accent-hover"
                      >
                        {open ? 'Less' : 'More'}
                      </button>
                    )}
                  </div>
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
