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

const COS = Math.cos(Math.PI / 6);
const SIN = 0.5;
const iso = (x: number, y: number, z: number): [number, number] => [(x - z) * COS, (x - 6 + z - 6) * SIN - y];

interface Block {
  faces: { d: string; shade: number }[];
  depth: number;
}

/** A few isometric blocks on a slab, seeded from the scene id: a stand-in until the real snapshot. */
function placeholderBlocks(seed: string): Block[] {
  let h = hash(seed);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    return h / 0xffffffff;
  };
  const box = (x: number, y: number, z: number, w: number, hgt: number, d: number): Block => {
    const p = (a: number, b: number, c: number) => iso(a, b, c).map((n) => n.toFixed(1)).join(' ');
    const top = `M${p(x, y + hgt, z)} L${p(x + w, y + hgt, z)} L${p(x + w, y + hgt, z + d)} L${p(x, y + hgt, z + d)} Z`;
    const left = `M${p(x, y, z + d)} L${p(x + w, y, z + d)} L${p(x + w, y + hgt, z + d)} L${p(x, y + hgt, z + d)} Z`;
    const right = `M${p(x + w, y, z)} L${p(x + w, y, z + d)} L${p(x + w, y + hgt, z + d)} L${p(x + w, y + hgt, z)} Z`;
    return { faces: [{ d: top, shade: 1 }, { d: left, shade: 0.62 }, { d: right, shade: 0.45 }], depth: x + z + y * 0.01 };
  };
  const blocks: Block[] = [box(0, 0, 0, 12, 1, 12)];
  const cells = 3 + Math.floor(next() * 4);
  for (let i = 0; i < cells; i++) {
    const w = 2 + Math.floor(next() * 4);
    const d = 2 + Math.floor(next() * 4);
    const x = Math.floor(next() * (12 - w));
    const z = Math.floor(next() * (12 - d));
    blocks.push(box(x, 1, z, w, 1 + Math.floor(next() * 6), d));
  }
  return blocks.sort((a, b) => a.depth - b.depth);
}

/**
 * A scene's thumbnail: the image captured the first time this browser opened that version, or, until
 * then, a small isometric placeholder generated from the scene's id.
 */
export function SnapshotImage({ hash: sceneHash, seed, className }: { hash?: string | null; seed: string; className?: string }) {
  const url = useSnapshot(sceneHash);
  const blocks = useMemo(() => placeholderBlocks(seed), [seed]);

  return (
    <div aria-hidden="true" className={cn('world-grid relative overflow-hidden rounded-[var(--radius-control)]', className)}>
      {url ? (
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      ) : (
        <svg viewBox="-12.5 -12 25 19" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full p-[8%]">
          {blocks.map((b, i) => (
            <g key={i}>
              {b.faces.map((f, k) => (
                <path key={k} d={f.d} fill={`rgb(${Math.round(150 * f.shade + 30)} ${Math.round(146 * f.shade + 30)} ${Math.round(138 * f.shade + 30)} / 0.55)`} stroke="rgb(255 255 255 / 0.08)" strokeWidth="0.06" />
              ))}
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}
