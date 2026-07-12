import type { HTMLAttributes } from 'react';

export type ChipTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'lilac';

const toneClasses: Record<ChipTone, string> = {
  neutral: 'border-hairline bg-surface-soft text-ink-muted',
  accent: 'border-transparent bg-accent-soft text-accent-strong',
  success: 'border-transparent bg-success-soft text-success',
  warning: 'border-transparent bg-warning-soft text-warning',
  danger: 'border-transparent bg-danger-soft text-danger',
  lilac: 'border-transparent bg-block-lilac/15 text-block-lilac',
};

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  mono?: boolean;
  dot?: boolean;
}

export function Chip({ tone = 'neutral', mono = false, dot = false, className = '', children, ...props }: ChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none ${
        mono ? 'font-mono uppercase tracking-wide' : ''
      } ${toneClasses[tone]} ${className}`}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}
