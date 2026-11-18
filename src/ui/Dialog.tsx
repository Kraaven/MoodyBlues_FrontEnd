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
  /** A mono line under the title: "Aperture / v.012". */
  context?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
  /** Title in the display face, large. For dialogs that are a destination (Unity connection). */
  display?: boolean;
}

export function Dialog({ open, onOpenChange, title, context, description, children, footer, width = 'sm', display = false }: DialogProps) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] animate-fade bg-[#0d0d0c]/70 backdrop-blur-[3px]" />
        <D.Content
          className={cn(
            'elevated fixed left-1/2 top-1/2 z-[61] flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden',
            'rounded-[var(--radius-dialog)] border border-rule-strong/70 bg-ink-2 focus:outline-none',
            'data-[state=open]:animate-[dialog-in_260ms_var(--ease-out-soft)]',
            width === 'sm' ? 'max-w-[460px]' : width === 'md' ? 'max-w-[580px]' : 'max-w-[760px]',
          )}
        >
          {/* The header and the footer stay in view; only the body scrolls, so a long dialog is usable on a small screen. */}
          <div className={cn('flex shrink-0 items-start justify-between gap-4', display ? 'px-8 pb-7 pt-8 sm:px-10 sm:pt-10' : 'px-6 pb-5 pt-6')}>
            <div className="min-w-0 space-y-1.5">
              <D.Title className={cn('text-fg [overflow-wrap:anywhere]', display ? 'display text-[34px] leading-[40px] sm:text-[40px] sm:leading-[46px]' : 'text-[17px] font-semibold leading-6')}>
                {title}
              </D.Title>
              {context && <p className="font-mono text-[13px] text-fg-3 [overflow-wrap:anywhere]">{context}</p>}
              {description ? (
                <D.Description className="pt-1 text-[14px] text-fg-2">{description}</D.Description>
              ) : (
                <D.Description className="sr-only">{title}</D.Description>
              )}
            </div>
            <D.Close
              className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-fg-3 transition-colors hover:bg-ink-3 hover:text-fg"
              aria-label="Close"
            >
              <X className={display ? 'h-6 w-6' : 'h-[18px] w-[18px]'} />
            </D.Close>
          </div>
          <div className={cn('min-h-0 flex-1 overflow-y-auto', display ? 'px-8 sm:px-10' : 'px-6', footer ? 'pb-1' : display ? 'pb-8 sm:pb-10' : 'pb-6')}>{children}</div>
          {footer && (
            <div className={cn('flex shrink-0 flex-wrap justify-end gap-2 border-t border-rule/70 pt-4', display ? 'px-8 pb-8 sm:px-10 sm:pb-10' : 'px-6 pb-6')}>{footer}</div>
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** What will be removed, in full. */
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
      <div className="space-y-4 text-[14px] text-fg-2">
        <div className="space-y-2.5">{body}</div>
        {disabledReason && <p className="text-caution">{disabledReason}</p>}
        {typeToConfirm && !disabledReason && (
          <div className="space-y-2">
            <label className="block text-[13px] text-fg-2" htmlFor="confirm-name">
              Type <span className="font-mono text-fg">{typeToConfirm}</span> to confirm.
            </label>
            <Input id="confirm-name" className="h-10 text-[14px]" autoFocus autoComplete="off" spellCheck={false} value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        )}
        <FormError>{error}</FormError>
      </div>
    </Dialog>
  );
}
