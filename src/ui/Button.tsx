import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';
import { Tooltip } from './Tooltip';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const base =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,opacity] duration-[120ms] disabled:pointer-events-none disabled:opacity-40';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-blue text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_6px_18px_-6px_rgb(61_99_240/0.6)] hover:bg-[#5577f4]',
  secondary: 'border border-rule-strong bg-ink-2 text-fg hover:border-blue/50 hover:bg-ink-3',
  ghost: 'text-fg-2 hover:bg-ink-2 hover:text-fg',
  danger: 'bg-danger/90 text-white hover:bg-danger',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
};

function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});

interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

export function LinkButton({ variant = 'primary', size = 'md', className, ...props }: LinkButtonProps) {
  return <Link className={buttonClass(variant, size, typeof className === 'string' ? className : undefined)} {...props} />;
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name and tooltip. */
  label: string;
  /** Shown in the tooltip, e.g. "F". */
  shortcut?: string;
  size?: 'sm' | 'md';
  active?: boolean;
  tooltip?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, size = 'md', active = false, tooltip = true, className, type = 'button', ...props },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={active || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] transition-colors duration-[120ms]',
        'disabled:pointer-events-none disabled:opacity-35',
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        active ? 'bg-blue/18 text-blue-bright' : 'text-fg-2 hover:bg-ink-2 hover:text-fg',
        className,
      )}
      {...props}
    />
  );
  if (!tooltip) return button;
  return <Tooltip content={shortcut ? `${label} (${shortcut})` : label}>{button}</Tooltip>;
});
