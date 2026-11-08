import { useState } from 'react';
import type { ReactNode } from 'react';
import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import { Button } from './Button';
import { FormError, Input } from './Field';
import { cn } from './cn';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md';
}

export function Dialog({ open, onOpenChange, title, description, children, footer, width = 'sm' }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] animate-fade bg-[#02030a]/70 backdrop-blur-[2px]" />
        <D.Content
          className={cn(
            'elevated fixed left-1/2 top-[18vh] z-[61] w-[calc(100vw-32px)] -translate-x-1/2 animate-rise',
            'rounded-[var(--radius-dialog)] border border-line bg-surface-1 p-6 focus:outline-none',
            width === 'sm' ? 'max-w-[440px]' : 'max-w-[560px]',
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <D.Title className="text-base font-semibold text-fg">{title}</D.Title>
              {description ? (
                <D.Description className="text-sm text-fg-2">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close className="-m-1 rounded-[var(--radius-control)] p-1 text-fg-3 transition-colors hover:text-fg" aria-label="Close">
              <X className="h-4 w-4" />
            </D.Close>
          </div>
          {children}
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What will be removed, in full (DESIGN.md Section 8). */
  body: ReactNode;
  confirmLabel: string;
  /** When set, the user must type this exactly before the button enables. */
  typeToConfirm?: string;
  onConfirm: () => Promise<unknown>;
  destructive?: boolean;
  disabledReason?: string | null;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  typeToConfirm,
  onConfirm,
  destructive = true,
  disabledReason,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = !typeToConfirm || typed.trim() === typeToConfirm.trim();

  const change = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setTyped('');
      setError(null);
    }
    onOpenChange(next);
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setTyped('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={change}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={() => change(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={confirm} loading={busy} disabled={!matches || Boolean(disabledReason)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-fg-2">
        <div className="space-y-2">{body}</div>
        {disabledReason && <p className="text-warn">{disabledReason}</p>}
        {typeToConfirm && !disabledReason && (
          <div className="space-y-1.5">
            <label className="block text-[13px] text-fg-2" htmlFor="confirm-name">
              Type <span className="font-mono text-fg">{typeToConfirm}</span> to confirm.
            </label>
            <Input id="confirm-name" autoFocus autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        )}
        <FormError>{error}</FormError>
      </div>
    </Dialog>
  );
}
