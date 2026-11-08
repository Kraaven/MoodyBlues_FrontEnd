import { useMemo } from 'react';
import { cn } from './cn';

/** FNV-1a, so the same scene always gets the same cover. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const HUES = ['91 124 250', '124 77 255', '34 211 238', '143 166 255', '99 102 241'];

/** Builds the CSS background of a scene's generated cover (DESIGN.md 7.4). */
function coverBackground(seed: string): string {
  let h = hash(seed);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    return h / 0xffffffff;
  };
  const blobs = [0, 1, 2].map(() => {
    const color = HUES[Math.floor(next() * HUES.length)];
    const x = Math.round(next() * 100);
    const y = Math.round(next() * 100);
    const size = 45 + Math.round(next() * 45);
    const alpha = (0.35 + next() * 0.4).toFixed(2);
    return `radial-gradient(${size}% ${size}% at ${x}% ${y}%, rgb(${color} / ${alpha}), transparent 70%)`;
  });
  return `${blobs.join(', ')}, linear-gradient(160deg, #0f1629, #070a14)`;
}

export function SceneCover({ seed, className }: { seed: string; className?: string }) {
  const background = useMemo(() => coverBackground(seed), [seed]);
  return <div aria-hidden="true" className={cn('rounded-[var(--radius-control)] border border-line', className)} style={{ background }} />;
}
