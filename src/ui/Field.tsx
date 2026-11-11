import { forwardRef, useId, useState } from 'react';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from './cn';

const control =
  'w-full rounded-[var(--radius-control)] border border-rule bg-ink-1 px-4 text-[15px] text-fg outline-none ' +
  'transition-[border-color,box-shadow,background-color] duration-[140ms] placeholder:text-fg-3 ' +
  'hover:border-rule-strong focus:border-accent/70 focus:bg-ink-0/60 focus:shadow-[0_0_0_3px_rgb(245_181_68/0.16)] focus-visible:outline-none ' +
  'aria-[invalid=true]:border-danger/70';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, 'h-12', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(control, 'min-h-24 py-3 leading-6', className)} {...props} />;
});

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /** Right of the label: "Optional", a "Forgot password?" link. */
  aside?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, aside, hint, error, id, type, className, ...props }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [reveal, setReveal] = useState(false);
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  const password = type === 'password';

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="block text-[14px] font-medium text-fg">
          {label}
        </label>
        {aside && <span className="text-[13px] text-fg-3">{aside}</span>}
      </div>
      <div className="relative">
        <Input
          ref={ref}
          id={inputId}
          type={password && reveal ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={password ? 'pr-12' : undefined}
          {...props}
        />
        {password && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            aria-pressed={reveal}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[var(--radius-control)] text-fg-3 transition-colors hover:text-fg"
          >
            {reveal ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-[13px] text-fg-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-[var(--radius-control)] border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger-soft">
      {children}
    </p>
  );
}

/** Information that is not a failure of what the user just did, such as an expired session. */
export function FormNotice({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="status" className="rounded-[var(--radius-control)] border border-accent/30 bg-accent/10 px-3.5 py-2.5 text-[13px] text-accent">
      {children}
    </p>
  );
}

/** An amber switch, for display settings. */
export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (checked: boolean) => void; label: string; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full transition-colors duration-[180ms]',
        checked ? 'bg-accent' : 'bg-ink-4',
      )}
    >
      <span
        className={cn(
          'absolute h-[16px] w-[16px] rounded-full shadow-[0_1px_2px_rgb(0_0_0/0.4)] transition-[left,background-color] duration-[180ms] ease-[var(--ease-out-soft)]',
          checked ? 'left-[21px] bg-ink-1' : 'left-[3px] bg-fg-2',
        )}
      />
    </button>
  );
}
