import type { ReactNode } from 'react';

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-xs">
      <span className="text-ink-faint">{label}</span>
      <span className="truncate text-right font-mono text-ink">{value}</span>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-faint">{children}</p>;
}
