import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LinkProps } from 'react-router-dom';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition disabled:cursor-not-allowed disabled:opacity-40';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-ink text-canvas hover:opacity-90',
  secondary: 'border border-hairline bg-surface text-ink hover:border-hairline-strong hover:bg-surface-hover',
  ghost: 'text-ink-muted hover:bg-white/5 hover:text-ink',
  danger: 'border border-danger/30 bg-danger-soft text-danger hover:bg-danger/20',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-1.5 text-xs',
  md: 'px-4.5 py-2 text-sm',
};

// oxlint-disable-next-line react/only-export-components -- shared class-name helper, kept alongside the components that use it
export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className = ''): string {
  return `${base} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim();
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return <button type="button" className={buttonClasses(variant, size, className)} {...props} />;
}

interface LinkButtonProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children?: ReactNode;
}

export function LinkButton({ variant = 'primary', size = 'md', className = '', ...props }: LinkButtonProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}

export type IconButtonVariant = 'ghost' | 'solid' | 'accent' | 'inverse';
export type IconButtonSize = 'sm' | 'md' | 'lg';

const iconButtonVariantClasses: Record<IconButtonVariant, string> = {
  ghost: 'bg-surface-soft text-ink-muted hover:bg-surface-hover hover:text-ink',
  solid: 'bg-ink text-canvas hover:opacity-90',
  accent: 'bg-accent-soft text-accent-strong hover:bg-accent/20',
  inverse: 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white',
};

const iconButtonSizeClasses: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
};

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

export function IconButton({ variant = 'ghost', size = 'md', className = '', ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center justify-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${iconButtonVariantClasses[variant]} ${iconButtonSizeClasses[size]} ${className}`}
      {...props}
    />
  );
}
