import { useState } from 'react';
import * as THREE from 'three';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useViewerStore } from '../viewerStore';
import { Row, SectionLabel } from './Row';

const MAP_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap'] as const;

function MaterialSwatch({ material }: { material: THREE.Material }) {
  const m = material as unknown as Record<string, unknown>;
  const color = m.color instanceof THREE.Color ? `#${(m.color as THREE.Color).getHexString()}` : null;

  return (
    <div
      className="h-8 w-8 shrink-0 rounded-full border border-white/15"
      style={{
        background: color ?? 'repeating-conic-gradient(#3a3a44 0% 25%, #26262d 0% 50%) 50% / 10px 10px',
      }}
    />
  );
}

function MaterialDetails({ material }: { material: THREE.Material }) {
  const m = material as unknown as Record<string, unknown>;
  const maps = MAP_SLOTS.filter((slot) => Boolean(m[slot]));

  return (
    <div className="space-y-2 border-t border-hairline p-2.5">
      <div>
        <SectionLabel>Properties</SectionLabel>
        <Row label="Type" value={material.type} />
        {m.color instanceof THREE.Color && <Row label="Color" value={`#${(m.color as THREE.Color).getHexString()}`} />}
        {typeof m.metalness === 'number' && <Row label="Metalness" value={m.metalness.toFixed(2)} />}
        {typeof m.roughness === 'number' && <Row label="Roughness" value={m.roughness.toFixed(2)} />}
        {m.emissive instanceof THREE.Color && <Row label="Emissive" value={`#${(m.emissive as THREE.Color).getHexString()}`} />}
        <Row label="Opacity" value={material.opacity.toFixed(2)} />
        <Row label="Transparent" value={String(material.transparent)} />
        <Row label="Side" value={material.side === THREE.DoubleSide ? 'Double' : material.side === THREE.BackSide ? 'Back' : 'Front'} />
      </div>
      <div>
        <SectionLabel>Maps</SectionLabel>
        <p className="text-xs text-ink">{maps.length > 0 ? maps.join(', ') : 'none'}</p>
      </div>
    </div>
  );
}

export function MaterialsPanel() {
  const materials = useViewerStore((s) => s.materials);
  const meshes = useViewerStore((s) => s.meshes);
  const highlightedMaterialUuid = useViewerStore((s) => s.highlightedMaterialUuid);
  const setHighlightedMaterial = useViewerStore((s) => s.setHighlightedMaterial);
  const [expandedUuid, setExpandedUuid] = useState<string | null>(materials[0]?.uuid ?? null);

  if (materials.length === 0) {
    return <p className="text-center text-sm text-ink-muted">No materials found.</p>;
  }

  const usageCount = (materialUuid: string) =>
    meshes.filter((m) => {
      const mats = Array.isArray(m.mesh.material) ? m.mesh.material : [m.mesh.material];
      return mats.some((mat) => mat?.uuid === materialUuid);
    }).length;

  return (
    <div className="space-y-1.5">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
        {materials.length} material{materials.length === 1 ? '' : 's'} -- click to highlight in viewport
      </p>
      {materials.map((material) => {
        const isOpen = expandedUuid === material.uuid;
        const isHighlighted = highlightedMaterialUuid === material.uuid;
        return (
          <div
            key={material.uuid}
            className={`rounded-lg border bg-canvas-raised/60 transition ${
              isHighlighted ? 'border-accent/50' : 'border-hairline'
            }`}
          >
            <div className="flex items-center gap-2 px-2.5 py-2">
              <button
                type="button"
                onClick={() => setHighlightedMaterial(isHighlighted ? null : material.uuid)}
                title="Highlight meshes using this material"
              >
                <MaterialSwatch material={material} />
              </button>
              <button
                type="button"
                onClick={() => setExpandedUuid(isOpen ? null : material.uuid)}
                className="flex flex-1 items-center justify-between gap-1.5 text-left text-xs text-ink"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{material.name || '(unnamed material)'}</span>
                  <span className="text-[10px] text-ink-faint">
                    used by {usageCount(material.uuid)} object{usageCount(material.uuid) === 1 ? '' : 's'}
                  </span>
                </span>
                {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
              </button>
            </div>
            {isOpen && <MaterialDetails material={material} />}
          </div>
        );
      })}
    </div>
  );
}
