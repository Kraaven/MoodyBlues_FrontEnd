import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Field } from './Field';

const CODE_LENGTH = 6;

interface CodeFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (code: string) => void;
  error?: string | null;
}

/** The 6-digit emailed code. Typing and pasting both keep only digits, so "123 456" from an email pastes cleanly. */
export const CodeField = forwardRef<HTMLInputElement, CodeFieldProps>(function CodeField({ value, onChange, ...props }, ref) {
  return (
    <Field
      ref={ref}
      label="Verification code"
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern={`[0-9]{${CODE_LENGTH}}`}
      maxLength={CODE_LENGTH}
      placeholder="000000"
      required
      inputClassName="font-mono text-[20px] tracking-[0.5em]"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
      {...props}
    />
  );
});
