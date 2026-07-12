import type { ComponentType } from 'react';

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}

export function Toggle({ label, description, checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-soft px-3 py-2.5 text-left transition hover:border-hairline-strong disabled:cursor-not-allowed disabled:opacity-40"
    >
      <div>
        <p className="text-xs font-medium text-ink">{label}</p>
        {description && <p className="text-[10px] text-ink-faint">{description}</p>}
      </div>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition ${checked ? 'bg-accent' : 'bg-white/10'}`}>
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}

export function IconToggle({
  label,
  checked,
  onChange,
  disabled,
  icon: Icon,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onChange}
      disabled={disabled}
      className={`flex h-9 w-9 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-30 ${
        checked
          ? 'border-accent/40 bg-accent-soft text-accent-strong'
          : 'border-hairline bg-canvas-raised/80 text-ink-muted hover:border-hairline-strong hover:text-ink'
      }`}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
