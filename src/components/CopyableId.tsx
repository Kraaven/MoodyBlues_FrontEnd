import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyableId({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      title={label ?? 'Copy Developer ID'}
      className="group flex items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2.5 py-1 font-mono text-xs text-zinc-300 transition hover:border-violet-400/40 hover:text-white"
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 text-zinc-500 group-hover:text-violet-300" />
      )}
    </button>
  );
}
