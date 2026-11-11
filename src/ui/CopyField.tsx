import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from './cn';
import { Tooltip } from './Tooltip';

/**
 * A monospace value with a copy button. `display` replaces the shown text (masked); the full
 * `value` is copied. `size="lg"` is the connection-string field of the Unity dialog.
 */
export function CopyField({
  value,
  label,
  display,
  className,
  size = 'sm',
}: {
  value: string;
  label: string;
  display?: string;
  className?: string;
  size?: 'sm' | 'lg';
}) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard blocked: the value is selectable as text anyway.
    }
  };

  return (
    <Tooltip content={copied ? 'Copied' : `Copy ${label}`}>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label}`}
        className={cn(
          'group inline-flex min-w-0 max-w-full items-center justify-between gap-3 rounded-[var(--radius-control)] border border-rule-strong bg-ink-3 font-mono text-fg',
          'transition-colors duration-[140ms] hover:border-accent/50',
          size === 'lg' ? 'h-16 w-full px-5 text-[16px]' : 'h-8 pl-3 pr-2 text-[12px] text-fg-2 hover:text-fg',
          className,
        )}
      >
        <span className="truncate">{display ?? value}</span>
        {copied ? (
          <Check className={cn('shrink-0 text-ok', size === 'lg' ? 'h-6 w-6' : 'h-3.5 w-3.5')} />
        ) : (
          <Copy className={cn('shrink-0 text-accent', size === 'lg' ? 'h-6 w-6' : 'h-3.5 w-3.5 text-fg-3 group-hover:text-accent')} />
        )}
      </button>
    </Tooltip>
  );
}
