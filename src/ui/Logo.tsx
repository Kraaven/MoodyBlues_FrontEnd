import { useId } from 'react';
import { cn } from './cn';

/** Brand option B, "Night play": a crescent moon whose cut-out is a play button (DESIGN.md 4). */
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" className={className}>
      <defs>
        <radialGradient id={`${id}g`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(20 16) rotate(48) scale(56)">
          <stop stopColor="#8FA6FF" />
          <stop offset="0.6" stopColor="#5B7CFA" />
          <stop offset="1" stopColor="#3B2A8C" />
        </radialGradient>
        <mask id={`${id}m`}>
          <rect width="64" height="64" fill="#fff" />
          <path d="M28 21l18 11-18 11z" fill="#000" stroke="#000" strokeWidth="5" strokeLinejoin="round" />
        </mask>
      </defs>
      <circle cx="30" cy="32" r="28" fill={`url(#${id}g)`} mask={`url(#${id}m)`} />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn('font-display text-[22px] italic leading-none tracking-[0.005em] text-fg', className)}>Moody Blues</span>;
}
