import { useMemo } from 'react';
import * as THREE from 'three';
import { ArrowUpRight, MousePointerClick } from 'lucide-react';
import { useViewerStore } from '../viewerStore';
import { Row, SectionLabel } from './Row';
import { Chip } from '../../components/ui/Chip';

function formatVector(v: THREE.Vector3, digits = 2): string {
  return `${v.x.toFixed(digits)}, ${v.y.toFixed(digits)}, ${v.z.toFixed(digits)}`;
}

function formatEulerDegrees(e: THREE.Euler): string {
  const toDeg = THREE.MathUtils.radToDeg;
  return `${toDeg(e.x).toFixed(1)}°, ${toDeg(e.y).toFixed(1)}°, ${toDeg(e.z).toFixed(1)}°`;
}

function friendlyType(object: THREE.Object3D): string {
  if ((object as THREE.SkinnedMesh).isSkinnedMesh) return 'Skinned Mesh';
  if ((object as THREE.Mesh).isMesh) return 'Mesh';
  if ((object as THREE.Bone).isBone) return 'Bone';
  if ((object as THREE.Light).isLight) return 'Light';
  if ((object as THREE.Camera).isCamera) return 'Camera';
  if (object.type === 'Group') return 'Group';
  return object.type || 'Object3D';
}

export function InspectorPanel() {
  const gltf = useViewerStore((s) => s.gltf);
  const selectedUuid = useViewerStore((s) => s.selectedUuid);
  const wireframe = useViewerStore((s) => s.wireframe);
  const setActivePanel = useViewerStore((s) => s.setActivePanel);
  const setHighlightedMaterial = useViewerStore((s) => s.setHighlightedMaterial);

  const object = useMemo(() => {
    if (!gltf || !selectedUuid) return null;
    return gltf.scene.getObjectByProperty('uuid', selectedUuid) ?? null;
  }, [gltf, selectedUuid]);

  if (!object) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <MousePointerClick className="h-5 w-5 text-ink-faint" />
        <p className="text-sm text-ink-muted">No object selected</p>
        <p className="max-w-[220px] text-xs text-ink-faint">
          Click an object in the viewport or select a node in the Hierarchy tab to inspect it.
        </p>
      </div>
    );
  }

  const mesh = (object as THREE.Mesh).isMesh ? (object as THREE.Mesh) : null;
  const meshMaterials = mesh ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
  const geometry = mesh?.geometry;
  const extras = Object.entries(object.userData ?? {});

  const worldPosition = new THREE.Vector3();
  object.getWorldPosition(worldPosition);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <p className="truncate text-sm font-medium text-ink">{object.name || '(unnamed)'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="accent">{friendlyType(object)}</Chip>
          {mesh && <Chip tone={wireframe ? 'warning' : 'neutral'}>{wireframe ? 'Wireframe on' : 'Wireframe off'}</Chip>}
        </div>
      </div>

      <div className="rounded-lg border border-hairline bg-canvas-raised/60 p-2.5">
        <SectionLabel>Transform (local)</SectionLabel>
        <Row label="Position" value={formatVector(object.position)} />
        <Row label="Rotation" value={formatEulerDegrees(object.rotation)} />
        <Row label="Scale" value={formatVector(object.scale)} />
        <div className="my-1.5 border-t border-hairline" />
        <Row label="World position" value={formatVector(worldPosition)} />
      </div>

      {mesh && geometry && (
        <div className="rounded-lg border border-hairline bg-canvas-raised/60 p-2.5">
          <SectionLabel>Geometry</SectionLabel>
          <Row label="Vertices" value={String(geometry.attributes.position?.count ?? 0)} />
          <Row
            label="Triangles"
            value={String(Math.round(geometry.index ? geometry.index.count / 3 : (geometry.attributes.position?.count ?? 0) / 3))}
          />
          <Row label="Attributes" value={Object.keys(geometry.attributes).join(', ')} />
        </div>
      )}

      {mesh && meshMaterials.length > 0 && (
        <div className="rounded-lg border border-hairline bg-canvas-raised/60 p-2.5">
          <SectionLabel>Material data</SectionLabel>
          <div className="space-y-1.5">
            {meshMaterials.map((material) => (
              <button
                key={material.uuid}
                type="button"
                onClick={() => {
                  setHighlightedMaterial(material.uuid);
                  setActivePanel('materials');
                }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left transition hover:bg-white/5"
              >
                <span className="flex items-center gap-2 truncate text-xs text-ink">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border border-white/20"
                    style={{
                      background:
                        'color' in material && (material as THREE.MeshStandardMaterial).color instanceof THREE.Color
                          ? `#${(material as THREE.MeshStandardMaterial).color.getHexString()}`
                          : '#888',
                    }}
                  />
                  {material.name || '(unnamed material)'}
                </span>
                <ArrowUpRight className="h-3 w-3 shrink-0 text-ink-faint" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-hairline bg-canvas-raised/60 p-2.5">
        <SectionLabel>Extra object data</SectionLabel>
        {extras.length === 0 ? (
          <p className="py-1 text-xs text-ink-faint">No extras on this object.</p>
        ) : (
          <div className="space-y-0.5">
            {extras.map(([key, value]) => (
              <Row key={key} label={key} value={typeof value === 'object' ? JSON.stringify(value) : String(value)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
