import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AlertTriangle, Info, Search, XCircle } from 'lucide-react';
import { LogLevel, logColorHex, type ReplayLog } from '../viewer/replay/replayFile';
import { cn } from '../ui/cn';
import { formatCount, formatPlayhead } from '../lib/format';
import { usePlaybackState, usePlaybackTime, type Playback } from './playback';
import { lastIndexAtOrBefore } from './logNav';

const LEVELS: { level: LogLevel; label: string }[] = [
  { level: LogLevel.Info, label: 'Info' },
  { level: LogLevel.Warning, label: 'Warning' },
  { level: LogLevel.Error, label: 'Error' },
];

function LevelIcon({ level, color }: { level: LogLevel; color: string }) {
  const className = 'mt-[3px] h-3.5 w-3.5 shrink-0';
  if (level === LogLevel.Error) return <XCircle className={className} style={{ color }} aria-label="Error" />;
  if (level === LogLevel.Warning) return <AlertTriangle className={className} style={{ color }} aria-label="Warning" />;
  return <Info className={className} style={{ color }} aria-label="Info" />;
}

/** Developer logs (DESIGN.md 7.6): filters, search, a virtualized list that follows the playhead. */
export function LogsTab({ logs, playback }: { logs: ReplayLog[]; playback: Playback }) {
  const [enabled, setEnabled] = useState<Set<LogLevel>>(() => new Set([LogLevel.Info, LogLevel.Warning, LogLevel.Error]));
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const time = usePlaybackTime(playback, 8);
  const { playing } = usePlaybackState(playback);

  const counts = useMemo(() => {
    const c: Record<LogLevel, number> = { [LogLevel.Info]: 0, [LogLevel.Warning]: 0, [LogLevel.Error]: 0 };
    for (const log of logs) c[log.level]++;
    return c;
  }, [logs]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const out: { log: ReplayLog; index: number }[] = [];
    logs.forEach((log, index) => {
      if (enabled.has(log.level) && (!needle || log.text.toLowerCase().includes(needle))) out.push({ log, index });
    });
    return out;
  }, [logs, enabled, search]);

  const filteredLogs = useMemo(() => filtered.map((f) => f.log), [filtered]);
  const active = lastIndexAtOrBefore(filteredLogs, time);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    overscan: 12,
  });

  // Follow the playhead while playing; leave the list alone while the user reads it paused.
  useEffect(() => {
    if (playing && active >= 0) virtualizer.scrollToIndex(active, { align: 'center' });
  }, [playing, active, virtualizer]);

  const toggle = (level: LogLevel) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-rule p-3">
        <div className="flex gap-1">
          {LEVELS.map(({ level, label }) => (
            <button
              key={level}
              type="button"
              aria-pressed={enabled.has(level)}
              onClick={() => toggle(level)}
              className={cn(
                'tabular flex h-7 items-center gap-1.5 rounded-[5px] border px-2 text-[12px] transition-colors duration-[120ms]',
                enabled.has(level) ? 'border-rule-strong bg-ink-2 text-fg' : 'border-transparent text-fg-3 line-through',
              )}
            >
              <LevelIcon level={level} color={level === LogLevel.Error ? '#ff5c5c' : level === LogLevel.Warning ? '#f5b544' : '#a3adc7'} />
              {label}
              <span className="font-mono text-[11px] text-fg-3">{formatCount(counts[level])}</span>
            </button>
          ))}
        </div>
        <label className="flex h-8 items-center gap-2 rounded-[var(--radius-control)] border border-rule-strong bg-ink-2 px-2.5 focus-within:border-blue">
          <Search className="h-3.5 w-3.5 shrink-0 text-fg-3" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search logs"
            className="w-full bg-transparent font-mono text-[12px] text-fg outline-none placeholder:text-fg-3"
          />
        </label>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-[13px] text-fg-2">
            {logs.length === 0 ? (
              <>
                No logs in this session. Write them from Unity with <span className="font-mono text-fg">MoodyBluesLog.Info</span>, Warning or Error.
              </>
            ) : (
              'No logs match the filters.'
            )}
          </p>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {virtualizer.getVirtualItems().map((item) => {
              const { log, index } = filtered[item.index];
              const color = logColorHex(log.color);
              const isOpen = expanded.has(index);
              const long = log.text.length > 160 || log.text.split('\n').length > 3;
              return (
                <div
                  key={item.key}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  className="absolute left-0 right-0"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <button
                    type="button"
                    onClick={() => playback.seek(log.time)}
                    className={cn(
                      'flex w-full gap-2.5 border-b border-rule/60 px-3 py-2 text-left transition-colors duration-[120ms] hover:bg-ink-2',
                      item.index === active && 'bg-blue/[0.09] shadow-[inset_2px_0_0_var(--color-blue)]',
                    )}
                  >
                    <LevelIcon level={log.level} color={color} />
                    <div className="min-w-0 flex-1">
                      <span className="tabular block font-mono text-[11px] text-fg-3">{formatPlayhead(log.time)}</span>
                      <span
                        className={cn('block whitespace-pre-wrap break-words font-mono text-[12px] leading-[18px]', !isOpen && 'line-clamp-3')}
                        style={{ color }}
                      >
                        {log.text || '(empty)'}
                      </span>
                      {long && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(index)) next.delete(index);
                              else next.add(index);
                              return next;
                            });
                          }}
                          className="mt-0.5 inline-block text-[11px] text-blue-bright hover:underline"
                        >
                          {isOpen ? 'Show less' : 'Show more'}
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
