import { logColorHex, type Replay } from '../viewer/replay/replayFile';

/** One log as a list shows it: its first line as the title, the rest as detail, and the text lowercased for searching. */
export interface LogRow {
  /** Index into replay.logs: stable across filtering and searching. */
  id: number;
  time: number;
  level: number;
  color: string;
  title: string;
  detail: string | null;
  search: string;
}

/** Every log of a replay as a row, in the replay's order. */
export function buildLogRows(replay: Replay): LogRow[] {
  return replay.logs.map((log, id) => {
    const [first, ...rest] = (log.text || '(empty)').split('\n');
    const detail = rest.join('\n').trim() || null;
    return { id, time: log.time, level: log.level, color: logColorHex(log.color), title: first, detail, search: `${first}\n${detail ?? ''}`.toLowerCase() };
  });
}
