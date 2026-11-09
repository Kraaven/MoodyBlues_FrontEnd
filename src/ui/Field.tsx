import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-[var(--radius-control)] border border-rule-strong bg-ink-2 px-3 text-sm text-fg outline-none',
        'transition-[border-color,box-shadow] duration-[120ms] placeholder:text-fg-3',
        'focus:border-blue focus:shadow-[0_0_0_3px_rgb(61_99_240/0.3)] focus-visible:outline-none',
        'aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  );
});

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, hint, error, id, ...props }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-[13px] font-medium text-fg-2">
        {label}
      </label>
      <Input ref={ref} id={inputId} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...props} />
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
    <p role="alert" className="rounded-[var(--radius-control)] border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-[#ffb3b3]">
      {children}
    </p>
  );
}

/** Information that is not a failure of what the user just did, such as an expired session. */
export function FormNotice({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="status" className="rounded-[var(--radius-control)] border border-caution/30 bg-caution/10 px-3 py-2 text-[13px] text-caution">
      {children}
    </p>
  );
}
