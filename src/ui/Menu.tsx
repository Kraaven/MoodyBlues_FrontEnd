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
  /** A key hint on the right. */
  hint?: string;
}

export function Menu({
  trigger,
  items,
  align = 'end',
  header,
}: {
  trigger: ReactElement;
  items: MenuItem[];
  align?: 'start' | 'end';
  /** Non-interactive text at the top, such as the signed-in address. */
  header?: ReactNode;
}) {
  return (
    <M.Root modal={false}>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className="elevated z-[65] min-w-[200px] animate-fade rounded-[var(--radius-card)] border border-rule-strong/70 bg-ink-2 p-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {header && <div className="border-b border-rule px-2.5 pb-2 pt-1.5 text-[12px] text-fg-3">{header}</div>}
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
      {item.separated && <M.Separator className="my-1.5 h-px bg-rule" />}
      <M.Item
        disabled={item.disabled}
        onSelect={item.onSelect}
        className={cn(
          'flex h-9 cursor-default select-none items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 text-[13px] outline-none',
          'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
          item.danger ? 'text-danger-soft data-[highlighted]:bg-danger/12' : 'text-fg data-[highlighted]:bg-ink-4',
        )}
      >
        {Icon && <Icon className="h-4 w-4 shrink-0 opacity-75" />}
        <span className="flex-1">{item.label}</span>
        {item.hint && <span className="font-mono text-[11px] text-fg-3">{item.hint}</span>}
      </M.Item>
    </>
  );
}
