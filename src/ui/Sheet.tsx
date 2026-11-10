import type { ReactNode } from 'react';
import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';

/** A panel that slides in from the right edge instead of covering the middle (DESIGN.md 7.3). */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] animate-fade bg-[#02030a]/50" />
        <D.Content className="glass elevated fixed inset-y-0 right-0 z-[61] flex w-[min(460px,100vw)] animate-fade flex-col border-l border-rule p-6 focus:outline-none">
          <div className="mb-5 flex items-start justify-between gap-4">
            <D.Title className="font-display text-[26px] leading-8 text-fg">{title}</D.Title>
            <D.Close className="-m-1 rounded-[var(--radius-control)] p-1 text-fg-3 transition-colors hover:text-fg" aria-label="Close">
              <X className="h-4 w-4" />
            </D.Close>
          </div>
          <D.Description className="sr-only">{title}</D.Description>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
