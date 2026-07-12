import type { HTMLAttributes } from 'react';

export type CardTone = 'default' | 'navy' | 'sunken';

const toneClasses: Record<CardTone, string> = {
  default: 'border border-hairline bg-surface',
  navy: 'border border-white/10 bg-block-navy',
  sunken: 'border border-hairline bg-canvas-raised',
};

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  interactive?: boolean;
}

export function Card({ tone = 'default', interactive = false, className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-2xl ${toneClasses[tone]} ${
        interactive ? 'cursor-pointer transition hover:border-hairline-strong hover:bg-surface-hover' : ''
      } ${className}`}
      {...props}
    />
  );
}
