export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(value >= 10 ? 1 : 2)} ${units[exponent]}`;
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${formatCount(count)} ${count === 1 ? one : many}`;
}

/** `12:04`, or `1:02:03` past an hour. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  return h > 0 ? `${h}:${mm}:${String(sec).padStart(2, '0')}` : `${mm}:${String(sec).padStart(2, '0')}`;
}

/** Playhead time with hundredths: `00:42.10`. */
export function formatPlayhead(seconds: number): string {
  const t = Math.max(0, seconds);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const cs = Math.floor((t % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** "Today 14:02", "Yesterday 09:10", "Tue 18:30" within a week, else a date. */
export function formatRecorded(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  if (days > 1 && days < 7) return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  return date.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** "3 minutes ago". */
export function formatAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return rtf.format(-seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour');
  return rtf.format(-Math.round(hours / 24), 'day');
}

/**
 * `https://mbk_Q7xZ2a…@host`: a connection string with most of its key hidden, for display.
 * Anything that is not a connection string is returned unchanged.
 */
export function maskConnection(connectionString: string): string {
  const match = /^(https?:\/\/)(mbk_[^@]{0,6})[^@]*@(.*)$/.exec(connectionString);
  return match ? `${match[1]}${match[2]}…@${match[3]}` : connectionString;
}

export function sceneTitle(scene: { displayName: string | null; sceneId: string }): string {
  return scene.displayName?.trim() || scene.sceneId;
}

export function safeFilename(name: string, extension: string): string {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9 _.-]/g, '-') || 'file';
  return cleaned.toLowerCase().endsWith(extension) ? cleaned : `${cleaned}${extension}`;
}
