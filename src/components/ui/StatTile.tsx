import type { LucideIcon } from 'lucide-react';

interface StatTileProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  hint?: string;
}

export function StatTile({ label, value, icon: Icon, hint }: StatTileProps) {
  return (
    <div className="rounded-xl border border-hairline bg-surface-soft px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-ink-faint">
        {Icon && <Icon className="h-3 w-3" />}
        <p className="font-mono text-[10px] uppercase tracking-[0.1em]">{label}</p>
      </div>
      <p className="mt-1.5 font-mono text-lg font-medium tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-ink-faint">{hint}</p>}
    </div>
  );
}
