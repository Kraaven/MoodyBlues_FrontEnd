import { useState } from 'react';
import * as THREE from 'three';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useViewerStore } from '../viewerStore';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="truncate text-right text-zinc-200">{value}</span>
    </div>
  );
}

function formatVector(v: THREE.Vector3): string {
  return `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`;
}

function GeometryDetails({ geometry }: { geometry: THREE.BufferGeometry }) {
  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }
  const box = geometry.boundingBox;
  const size = box ? box.getSize(new THREE.Vector3()) : null;

  const attributeNames = Object.keys(geometry.attributes);

  return (
    <div className="space-y-2 border-t border-white/5 px-2 py-2">
      <div>
        <Row label="Vertices" value={String(geometry.attributes.position?.count ?? 0)} />
        <Row label="Indices" value={geometry.index ? String(geometry.index.count) : 'none (non-indexed)'} />
        <Row label="Triangles" value={String(geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count ?? 0) / 3)} />
      </div>

      {size && (
        <div>
          <Row label="Bounding size" value={formatVector(size)} />
        </div>
      )}

      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-600">Attributes</p>
        {attributeNames.map((name) => {
          const attr = geometry.attributes[name];
          return <Row key={name} label={name} value={`itemSize ${attr.itemSize}, count ${attr.count}`} />;
        })}
      </div>
    </div>
  );
}

export function GeometryPanel() {
  const meshes = useViewerStore((s) => s.meshes);
  const selectedUuid = useViewerStore((s) => s.selectedUuid);
  const selectNode = useViewerStore((s) => s.selectNode);
  const [expandedUuid, setExpandedUuid] = useState<string | null>(null);

  if (meshes.length === 0) {
    return <p className="text-center text-sm text-zinc-500">No mesh geometry found.</p>;
  }

  return (
    <div className="space-y-1.5">
      {meshes.map(({ uuid, name, geometry }) => {
        const isOpen = expandedUuid === uuid;
        const isSelected = selectedUuid === uuid;
        return (
          <div
            key={uuid}
            className={`rounded-md border bg-black/20 ${isSelected ? 'border-violet-400/40' : 'border-white/10'}`}
          >
            <button
              type="button"
              onClick={() => {
                setExpandedUuid(isOpen ? null : uuid);
                selectNode(uuid);
              }}
              className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs text-zinc-200"
            >
              {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
              <span className="truncate font-medium">{name}</span>
            </button>
            {isOpen && <GeometryDetails geometry={geometry} />}
          </div>
        );
      })}
    </div>
  );
}
