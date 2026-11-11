import type { ReactNode } from 'react';
import type { SceneProcessingStatus, SessionStatus } from '../api/types';
import { cn } from './cn';

export type Tone = 'neutral' | 'accent' | 'ok' | 'work' | 'wait' | 'danger' | 'live' | 'caution';

const text: Record<Tone, string> = {
  neutral: 'text-fg-2',
  accent: 'text-accent',
  ok: 'text-ok',
  work: 'text-work',
  wait: 'text-wait',
  danger: 'text-danger-soft',
  live: 'text-live',
  caution: 'text-caution',
};

const fill: Record<Tone, string> = {
  neutral: 'bg-fg-3',
  accent: 'bg-accent',
  ok: 'bg-ok',
  work: 'bg-work',
  wait: 'bg-wait',
  danger: 'bg-danger',
  live: 'bg-live',
  caution: 'bg-caution',
};

/** A small filled tag: "Latest", "Archived". */
export function Tag({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center rounded-[4px] px-2 text-[12px] font-medium leading-none',
        tone === 'accent' ? 'bg-accent/16 text-accent' : tone === 'neutral' ? 'bg-ink-4 text-fg-2' : cn('bg-ink-3', text[tone]),
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A status as a dot and a label. The dot pulses for live and sweeps for work in progress. */
export function Status({ tone, label, className, compact = false }: { tone: Tone; label: string; className?: string; compact?: boolean }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2 text-[13px]', text[tone], className)} title={compact ? label : undefined}>
      <span aria-hidden="true" className={cn('relative h-2 w-2 shrink-0 rounded-full', fill[tone], tone === 'live' && 'animate-pulse-live', tone === 'work' && 'animate-pulse')} />
      <span className={cn('truncate', compact && 'sr-only')}>{label}</span>
    </span>
  );
}

export const SESSION_STATUS: Record<SessionStatus, { label: string; tone: Tone }> = {
  Recording: { label: 'Recording', tone: 'live' },
  Queued: { label: 'Queued', tone: 'work' },
  Compiling: { label: 'Building', tone: 'work' },
  Ready: { label: 'Ready', tone: 'ok' },
  Failed: { label: 'Failed', tone: 'danger' },
  WaitingForScene: { label: 'Waiting for scene', tone: 'wait' },
};

export function SessionStatusLabel({ status, compact }: { status: SessionStatus; compact?: boolean }) {
  const s = SESSION_STATUS[status] ?? SESSION_STATUS.Queued;
  return <Status tone={s.tone} label={s.label} compact={compact} />;
}

const VERSION: Record<SceneProcessingStatus, { label: string; tone: Tone }> = {
  Pending: { label: 'Optimizing', tone: 'work' },
  Processing: { label: 'Optimizing', tone: 'work' },
  Ready: { label: 'Ready', tone: 'ok' },
  Failed: { label: 'Not optimized', tone: 'caution' },
};

export function VersionStatus({ status }: { status: SceneProcessingStatus }) {
  const s = VERSION[status] ?? VERSION.Pending;
  return <Status tone={s.tone} label={s.label} />;
}

/** `v.012`: how a scene version is written everywhere. */
export function versionLabel(version: number): string {
  return `v.${String(version).padStart(3, '0')}`;
}
