import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CopyableIdProps {
  value: string;
  label?: string;
  tone?: 'default' | 'inverse';
}

export function CopyableId({ value, label, tone = 'default' }: CopyableIdProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const toneClasses =
    tone === 'inverse'
      ? 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:text-white'
      : 'border-hairline bg-canvas-raised text-ink-muted hover:border-hairline-strong hover:text-ink';

  return (
    <button
      type="button"
      onClick={onCopy}
      title={label ?? 'Copy Developer ID'}
      className={`group flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[11px] transition ${toneClasses}`}
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover:text-accent-strong group-hover:opacity-100" />
      )}
    </button>
  );
}
