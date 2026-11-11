import type { ReactElement, ReactNode } from 'react';
import { Tooltip as T } from 'radix-ui';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <T.Provider delayDuration={350} skipDelayDuration={200}>
      {children}
    </T.Provider>
  );
}

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode;
  children: ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  if (!content) return children;
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={7}
          collisionPadding={8}
          className="elevated z-[70] max-w-xs animate-fade rounded-[var(--radius-control)] border border-rule-strong/70 bg-ink-3 px-2.5 py-1.5 text-[12px] leading-4 text-fg"
        >
          {content}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
