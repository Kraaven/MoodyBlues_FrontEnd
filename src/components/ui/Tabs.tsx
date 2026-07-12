import type { LucideIcon } from 'lucide-react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  className?: string;
}

export function Tabs<T extends string>({ items, activeId, onChange, className = '' }: TabsProps<T>) {
  return (
    <div className={`flex border-b border-hairline ${className}`}>
      {items.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeId === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            title={tab.label}
            onClick={() => onChange(tab.id)}
            className={`flex flex-1 flex-col items-center gap-1 border-b-2 py-2.5 text-[10px] font-medium transition ${
              isActive ? 'border-accent text-ink' : 'border-transparent text-ink-faint hover:text-ink-muted'
            }`}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
