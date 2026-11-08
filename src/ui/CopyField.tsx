import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from './cn';
import { Tooltip } from './Tooltip';

/** A monospace value with a copy button. */
export function CopyField({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
          'group inline-flex h-8 min-w-0 max-w-full items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface-2 pl-2.5 pr-2',
          'font-mono text-[12px] text-fg-2 transition-colors duration-[120ms] hover:border-accent/50 hover:text-fg',
          className,
        )}
      >
        <span className="truncate">{value}</span>
        {copied ? <Check className="h-3.5 w-3.5 shrink-0 text-ok" /> : <Copy className="h-3.5 w-3.5 shrink-0 text-fg-3 group-hover:text-accent-bright" />}
      </button>
    </Tooltip>
  );
}
