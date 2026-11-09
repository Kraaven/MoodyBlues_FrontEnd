import type { ReactNode } from 'react';
import type { SceneProcessingStatus, SessionStatus } from '../api/types';
import { cn } from './cn';

export type ChipTone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'live';

const tones: Record<ChipTone, string> = {
  neutral: 'border-rule-strong bg-ink-2 text-fg-2',
  accent: 'border-blue/35 bg-blue/12 text-blue-bright',
  ok: 'border-ok/30 bg-ok/10 text-ok',
  warn: 'border-caution/30 bg-caution/10 text-caution',
  danger: 'border-danger/35 bg-danger/10 text-[#ff8a8a]',
  live: 'border-live/35 bg-live/10 text-[#ff8ca0]',
};

const dots: Record<ChipTone, string> = {
  neutral: 'bg-fg-3',
  accent: 'bg-blue-bright',
  ok: 'bg-ok',
  warn: 'bg-caution',
  danger: 'bg-danger',
  live: 'bg-live animate-pulse-live',
};

export function Chip({
  tone = 'neutral',
  dot = false,
  mono = false,
  working = false,
  className,
  children,
}: {
  tone?: ChipTone;
  dot?: boolean;
  mono?: boolean;
  /** Animated shimmer for in-progress states (DESIGN.md 5.1). */
  working?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'relative inline-flex h-6 shrink-0 items-center gap-1.5 overflow-hidden rounded-full border px-2 text-[12px] font-medium leading-none',
        mono && 'font-mono',
        tones[tone],
        className,
      )}
    >
      {working && <span aria-hidden="true" className="shimmer absolute inset-0" />}
      {dot && <span aria-hidden="true" className={cn('relative h-1.5 w-1.5 rounded-full', dots[tone])} />}
      <span className="relative">{children}</span>
    </span>
  );
}

const SESSION: Record<SessionStatus, { label: string; tone: ChipTone; working?: boolean }> = {
  Recording: { label: 'Recording', tone: 'live' },
  Queued: { label: 'Queued', tone: 'accent', working: true },
  Compiling: { label: 'Building replay', tone: 'accent', working: true },
  Ready: { label: 'Ready', tone: 'ok' },
  Failed: { label: 'Failed', tone: 'danger' },
  WaitingForScene: { label: 'Waiting for scene', tone: 'warn' },
};

export function SessionStatusChip({ status }: { status: SessionStatus }) {
  const s = SESSION[status] ?? SESSION.Queued;
  return (
    <Chip tone={s.tone} dot working={s.working}>
      {s.label}
    </Chip>
  );
}

const VERSION: Record<SceneProcessingStatus, { label: string; tone: ChipTone; working?: boolean }> = {
  Pending: { label: 'Optimizing', tone: 'accent', working: true },
  Processing: { label: 'Optimizing', tone: 'accent', working: true },
  Ready: { label: 'Ready', tone: 'ok' },
  Failed: { label: 'Optimization failed', tone: 'warn' },
};

export function VersionStatusChip({ status }: { status: SceneProcessingStatus }) {
  const s = VERSION[status] ?? VERSION.Pending;
  return (
    <Chip tone={s.tone} dot working={s.working}>
      {s.label}
    </Chip>
  );
}

export function VersionChip({ version, current }: { version: number; current?: boolean }) {
  return (
    <Chip tone={current ? 'accent' : 'neutral'} mono>
      v{version}
      {current ? ' · current' : ''}
    </Chip>
  );
}
