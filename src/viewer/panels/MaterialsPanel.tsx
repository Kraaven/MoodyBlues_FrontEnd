import { useState } from 'react';
import * as THREE from 'three';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useViewerStore } from '../viewerStore';
import { Row } from './Row';

const MAP_SLOTS = [
  { key: 'map', label: 'Base color' },
  { key: 'normalMap', label: 'Normal' },
  { key: 'roughnessMap', label: 'Roughness' },
  { key: 'metalnessMap', label: 'Metallic' },
  { key: 'aoMap', label: 'AO' },
  { key: 'emissiveMap', label: 'Emissive' },
  { key: 'alphaMap', label: 'Alpha' },
  { key: 'bumpMap', label: 'Bump' },
  { key: 'displacementMap', label: 'Displacement' },
] as const;

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
  const color = m.color instanceof THREE.Color ? `#${(m.color as THREE.Color).getHexString()}` : null;
  const emissive = m.emissive instanceof THREE.Color ? `#${(m.emissive as THREE.Color).getHexString()}` : null;
  const mapsWithTex = MAP_SLOTS.filter(({ key }) => Boolean(m[key]));

  return (
    <div className="space-y-2 border-t border-hairline p-2.5">
      <div className="rounded-lg border border-hairline/50 bg-surface-soft/40 p-2 space-y-0.5">
        <Row label="Type" value={material.type} />
        {color && <Row label="Base color" value={color} />}
        {typeof m.metalness === 'number' && <Row label="Metalness" value={(m.metalness as number).toFixed(3)} />}
        {typeof m.roughness === 'number' && <Row label="Roughness" value={(m.roughness as number).toFixed(3)} />}
        {emissive && <Row label="Emissive" value={emissive} />}
        <Row label="Opacity" value={material.opacity.toFixed(2)} />
        <Row label="Transparent" value={String(material.transparent)} />
        <Row
          label="Side"
          value={material.side === THREE.DoubleSide ? 'Double' : material.side === THREE.BackSide ? 'Back' : 'Front'}
        />
      </div>

      {mapsWithTex.length > 0 && (
        <div className="rounded-lg border border-hairline/50 bg-surface-soft/40 p-2">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint">
            Texture maps ({mapsWithTex.length})
          </p>
          <div className="space-y-0.5">
            {mapsWithTex.map(({ key, label }) => {
              const tex = m[key] as THREE.Texture;
              const w = (tex.image as { width?: number })?.width;
              const h = (tex.image as { height?: number })?.height;
              return (
                <Row
                  key={key}
                  label={label}
                  value={w && h ? `${w}\u00D7${h}` : tex.name || 'present'}
                />
              );
            })}
          </div>
        </div>
      )}

      {material.userData && Object.keys(material.userData).length > 0 && (
        <div className="rounded-lg border border-hairline/50 bg-surface-soft/40 p-2">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint">Extensions</p>
          <div className="flex flex-wrap gap-1">
            {Object.keys(material.userData).map((ext) => (
              <span key={ext} className="rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[10px] text-accent-strong">
                {ext}
              </span>
            ))}
          </div>
        </div>
      )}
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
    return <p className="text-center text-sm text-ink-muted py-4">No materials found.</p>;
  }

  const usageCount = (materialUuid: string) =>
    meshes.filter((m) => {
      const mats = Array.isArray(m.mesh.material) ? m.mesh.material : [m.mesh.material];
      return mats.some((mat) => mat?.uuid === materialUuid);
    }).length;

  const totalUsedBy = materials.reduce((sum, mat) => sum + usageCount(mat.uuid), 0);

  return (
    <div className="space-y-1.5">
      <div className="mb-2 flex items-center gap-2">
        <p className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
          {materials.length} material{materials.length === 1 ? '' : 's'}
        </p>
        <span className="text-[10px] text-ink-faint/60">&middot;</span>
        <span className="text-[10px] text-ink-faint/60">
          {totalUsedBy} assignment{totalUsedBy === 1 ? '' : 's'} across {meshes.length} mesh{meshes.length === 1 ? '' : 'es'}
        </span>
      </div>

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
