import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react';

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-hairline bg-canvas-raised px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-accent/50 ${className}`}
      {...props}
    />
  );
}

export function Label({ className = '', ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`mb-1.5 block text-xs font-medium text-ink-muted ${className}`} {...props} />;
}

export function FieldError({ children }: { children: ReactNode }) {
  return <p className="text-sm text-danger">{children}</p>;
}
