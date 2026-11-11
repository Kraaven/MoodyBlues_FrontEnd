import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LinkProps } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';
import { Tooltip } from './Tooltip';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'group/btn relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-[140ms] active:translate-y-px ' +
  'disabled:pointer-events-none disabled:opacity-40';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-on-accent shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_8px_22px_-10px_rgb(245_181_68/0.7)] hover:bg-accent-hover',
  secondary: 'border border-rule-strong bg-ink-3 text-fg hover:border-fg-3/60 hover:bg-ink-4',
  quiet: 'border border-rule bg-ink-1/60 text-fg hover:border-rule-strong hover:bg-ink-3',
  ghost: 'text-fg-2 hover:bg-ink-3 hover:text-fg',
  danger: 'border border-danger/40 bg-danger/12 text-danger-soft hover:bg-danger/20',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-[14px]',
  lg: 'h-12 px-5 text-[15px]',
};

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** A trailing icon pushed to the far edge, as on the wide form buttons. */
  trailing?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, trailing, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClass(variant, size, cn(Boolean(trailing) && 'justify-between', className))} disabled={disabled || loading} {...props}>
      {trailing && <span aria-hidden="true" className="w-4" />}
      <span className="inline-flex items-center gap-2">
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {children}
      </span>
      {trailing && <span className="inline-flex transition-transform duration-[180ms] group-hover/btn:translate-x-0.5">{trailing}</span>}
    </button>
  );
});

interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  trailing?: ReactNode;
  children?: ReactNode;
}

export function LinkButton({ variant = 'primary', size = 'md', className, trailing, children, ...props }: LinkButtonProps) {
  return (
    <Link className={buttonClass(variant, size, cn(Boolean(trailing) && 'justify-between', typeof className === 'string' ? className : undefined))} {...props}>
      {children}
      {trailing && <span className="inline-flex transition-transform duration-[180ms] group-hover/btn:translate-x-0.5">{trailing}</span>}
    </Link>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name and tooltip. */
  label: string;
  /** Shown in the tooltip, e.g. "F". */
  shortcut?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  active?: boolean;
  tooltip?: boolean;
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, shortcut, size = 'md', active = false, tooltip = true, tooltipSide, className, type = 'button', ...props },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={active || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] transition-colors duration-[140ms]',
        'disabled:pointer-events-none disabled:opacity-35',
        size === 'xs' ? 'h-7 w-7' : size === 'sm' ? 'h-8 w-8' : size === 'md' ? 'h-10 w-10' : 'h-12 w-12',
        active ? 'bg-accent/18 text-accent' : 'text-fg-2 hover:bg-ink-3 hover:text-fg',
        className,
      )}
      {...props}
    />
  );
  if (!tooltip) return button;
  return (
    <Tooltip content={shortcut ? <TipWithKey label={label} shortcut={shortcut} /> : label} side={tooltipSide}>
      {button}
    </Tooltip>
  );
});

function TipWithKey({ label, shortcut }: { label: string; shortcut: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      {label}
      <kbd className="rounded border border-rule-strong bg-ink-1 px-1 font-mono text-[10px] leading-4 text-fg-2">{shortcut}</kbd>
    </span>
  );
}
