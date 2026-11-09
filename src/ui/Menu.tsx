import type { ReactElement, ReactNode } from 'react';
import { DropdownMenu as M } from 'radix-ui';
import type { LucideIcon } from 'lucide-react';
import { cn } from './cn';

export interface MenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Shown as a separator before this item. */
  separated?: boolean;
}

export function Menu({ trigger, items, align = 'end' }: { trigger: ReactElement; items: MenuItem[]; align?: 'start' | 'end' }) {
  return (
    <M.Root modal={false}>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className="elevated z-[65] min-w-[184px] animate-fade rounded-[var(--radius-card)] border border-rule bg-ink-2 p-1"
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item) => (
            <MenuRow key={item.label} item={item} />
          ))}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

function MenuRow({ item }: { item: MenuItem }): ReactNode {
  const Icon = item.icon;
  return (
    <>
      {item.separated && <M.Separator className="my-1 h-px bg-rule" />}
      <M.Item
        disabled={item.disabled}
        onSelect={item.onSelect}
        className={cn(
          'flex h-8 cursor-default select-none items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 text-[13px] outline-none',
          'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
          item.danger ? 'text-danger data-[highlighted]:bg-danger/12' : 'text-fg data-[highlighted]:bg-ink-3',
        )}
      >
        {Icon && <Icon className="h-4 w-4 shrink-0 opacity-80" />}
        {item.label}
      </M.Item>
    </>
  );
}
