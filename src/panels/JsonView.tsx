import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { cn } from '../ui/cn';

/**
 * Raw data (DESIGN.md 9.5): the escape hatch to the truth, so anything the interface says can be
 * checked against what the backend or the file actually holds. Read-only, collapsible, copyable.
 */
export function JsonView({ value, label }: { value: unknown; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the clipboard is not available here */
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2">
        <span className="truncate text-[12px] text-fg-3">{label}</span>
        <IconButton label={copied ? 'Copied' : 'Copy all as JSON'} size="sm" onClick={() => void copy()}>
          {copied ? <Check className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />}
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[12px] leading-[18px]" role="tree" aria-label={label}>
        <Node name={null} value={value} depth={0} />
      </div>
    </div>
  );
}

function Primitive({ value }: { value: unknown }) {
  if (value === null) return <span className="text-fg-3">null</span>;
  if (typeof value === 'string') return <span className="break-all text-fg">&quot;{value}&quot;</span>;
  if (typeof value === 'number') return <span className="text-blue-bright">{Number.isInteger(value) ? value : Number(value.toFixed(5))}</span>;
  if (typeof value === 'boolean') return <span className="text-caution">{String(value)}</span>;
  return <span className="text-fg-3">{String(value)}</span>;
}

function Node({ name, value, depth }: { name: string | null; value: unknown; depth: number }) {
  const isArray = Array.isArray(value);
  const isObject = typeof value === 'object' && value !== null;
  const entries: [string, unknown][] = isObject ? (isArray ? value.map((v, i) => [String(i), v] as [string, unknown]) : Object.entries(value as Record<string, unknown>)) : [];
  const [open, setOpen] = useState(depth < 1);

  const key = name !== null && <span className="text-fg-2">{name}: </span>;

  if (!isObject) {
    return (
      <div role="treeitem" aria-selected="false" className="pl-4">
        {key}
        <Primitive value={value} />
      </div>
    );
  }

  return (
    <div role="treeitem" aria-expanded={open} aria-selected="false">
      <button type="button" onClick={() => setOpen((o) => !o)} className="-ml-0.5 flex items-center gap-0.5 text-left hover:text-fg">
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-fg-3" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-3" />}
        {key}
        <span className="text-fg-3">
          {isArray ? `[${entries.length}]` : `{${entries.length}}`}
        </span>
      </button>
      {open && (
        <div role="group" className={cn('ml-1.5 border-l border-rule pl-2')}>
          {entries.length === 0 ? <span className="pl-4 text-fg-3">empty</span> : entries.map(([k, v]) => <Node key={k} name={k} value={v} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}
