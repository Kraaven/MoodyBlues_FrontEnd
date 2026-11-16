import type { LucideIcon } from 'lucide-react';
import { formatDuration } from '../lib/format';

/** "Play", or "Play from 01:23" when the link starts part way in. */
export function playLabel(startSeconds: number): string {
  return startSeconds > 0 ? `Play from ${formatDuration(startSeconds)}` : 'Play';
}

interface Download {
  label: string;
  received: number;
  total: number | null;
}

/**
 * How far the two downloads (scene, replay) have come, as one fraction for the Play button. A
 * finished part counts as whole, one not yet started as nothing, and a running one by its bytes;
 * a running part whose size is unknown makes the whole thing `null` (indeterminate).
 */
export function combinedProgress(parts: { done: boolean; download: Download | null }[]): number | null {
  let sum = 0;
  for (const { done, download } of parts) {
    if (done) sum += 1;
    else if (download) {
      if (!download.total) return null;
      sum += Math.min(1, download.received / download.total);
    }
  }
  return sum / parts.length;
}

interface RailEntry {
  id: string;
  group?: string;
  description?: string;
  icon: LucideIcon;
  title: string;
}

export interface RailRow {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

/**
 * The rail's rows grouped as the rail groups them: the windows by `group` in rail order, then the
 * tools. Entries without a description are left out.
 */
export function railGroups(windows: readonly { id: string; group: string; title: string; icon: LucideIcon; description?: string }[], tools: readonly { id: string; label: string; icon: LucideIcon; description?: string }[]): RailRow[][] {
  const entries: RailEntry[] = [
    ...windows.map((w) => ({ id: w.id, group: w.group, title: w.title, icon: w.icon, description: w.description })),
    ...tools.map((t) => ({ id: t.id, group: '~tools', title: t.label, icon: t.icon, description: t.description })),
  ];
  const order = ['recordings', 'scene', 'session', '~tools'];
  return order
    .map((group) =>
      entries
        .filter((e) => e.group === group && e.description)
        .map((e) => ({ id: e.id, icon: e.icon, title: e.title, description: e.description as string })),
    )
    .filter((rows) => rows.length > 0);
}
