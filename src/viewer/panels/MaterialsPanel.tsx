import { useState } from 'react';
import * as THREE from 'three';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useViewerStore } from '../viewerStore';

const MAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap'] as const;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="truncate text-right text-zinc-200">{value}</span>
    </div>
  );
}

function MaterialDetails({ material }: { material: THREE.Material }) {
  const m = material as unknown as Record<string, unknown>;
  const maps = MAP_SLOTS.filter((slot) => Boolean(m[slot]));

  return (
    <div className="space-y-0.5 border-t border-white/5 px-2 py-2">
      <Row label="Type" value={material.type} />
      {m.color instanceof THREE.Color && <Row label="Color" value={`#${(m.color as THREE.Color).getHexString()}`} />}
      {typeof m.metalness === 'number' && <Row label="Metalness" value={m.metalness.toFixed(2)} />}
      {typeof m.roughness === 'number' && <Row label="Roughness" value={m.roughness.toFixed(2)} />}
      {m.emissive instanceof THREE.Color && <Row label="Emissive" value={`#${(m.emissive as THREE.Color).getHexString()}`} />}
      <Row label="Opacity" value={material.opacity.toFixed(2)} />
      <Row label="Transparent" value={String(material.transparent)} />
      <Row label="Side" value={material.side === THREE.DoubleSide ? 'Double' : material.side === THREE.BackSide ? 'Back' : 'Front'} />
      <Row label="Maps" value={maps.length > 0 ? maps.join(', ') : 'none'} />
    </div>
  );
}

export function MaterialsPanel() {
  const materials = useViewerStore((s) => s.materials);
  const [expandedUuid, setExpandedUuid] = useState<string | null>(materials[0]?.uuid ?? null);

  if (materials.length === 0) {
    return <p className="text-center text-sm text-zinc-500">No materials found.</p>;
  }

  return (
    <div className="space-y-1.5">
      {materials.map((material) => {
        const isOpen = expandedUuid === material.uuid;
        return (
          <div key={material.uuid} className="rounded-md border border-white/10 bg-black/20">
            <button
              type="button"
              onClick={() => setExpandedUuid(isOpen ? null : material.uuid)}
              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs text-zinc-200"
            >
              {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
              <span className="truncate font-medium">{material.name || '(unnamed material)'}</span>
            </button>
            {isOpen && <MaterialDetails material={material} />}
          </div>
        );
      })}
    </div>
  );
}
