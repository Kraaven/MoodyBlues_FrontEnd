import { useMemo } from 'react';
import { useSnapshot } from '../stage/snapshots';
import { cn } from './cn';

/** FNV-1a, so the same scene always gets the same placeholder. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Three smooth curves with a dot at the head of each: a tiny Trace, seeded from the scene id. */
function placeholderCurves(seed: string): { d: string; head: [number, number]; warm: boolean }[] {
  let h = hash(seed);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    return h / 0xffffffff;
  };
  return Array.from({ length: 3 }, (_, i) => {
    const y0 = 18 + next() * 54;
    const points = Array.from({ length: 4 }, (_, k) => [10 + k * 46 + next() * 14, 10 + next() * 70] as const);
    const d =
      `M 8 ${y0.toFixed(1)} ` +
      points.map(([x, y]) => `S ${(x - 18).toFixed(1)} ${y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const last = points[points.length - 1];
    return { d, head: [last[0], last[1]] as [number, number], warm: i === 2 && next() > 0.5 };
  });
}

/**
 * A scene's thumbnail (DESIGN.md 7.4): the image captured the first time this browser opened that
 * version, or, until then, a small generated placeholder.
 */
export function SnapshotImage({ hash: sceneHash, seed, className }: { hash?: string | null; seed: string; className?: string }) {
  const url = useSnapshot(sceneHash);
  const curves = useMemo(() => placeholderCurves(seed), [seed]);

  return (
    <div aria-hidden="true" className={cn('relative overflow-hidden rounded-[var(--radius-control)] border border-rule bg-ink-2', className)}>
      {url ? (
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      ) : (
        <svg viewBox="0 0 200 90" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
          <defs>
            <linearGradient id="snap-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0d1324" />
              <stop offset="1" stopColor="#04060d" />
            </linearGradient>
          </defs>
          <rect width="200" height="90" fill="url(#snap-bg)" />
          {curves.map((c, i) => (
            <g key={i}>
              <path d={c.d} fill="none" stroke={c.warm ? '#ffb547' : '#8ca8ff'} strokeWidth="1" opacity="0.55" />
              <circle cx={c.head[0]} cy={c.head[1]} r="2" fill={c.warm ? '#ffb547' : '#8ca8ff'} />
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
