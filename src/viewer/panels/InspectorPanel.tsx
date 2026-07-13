import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { MousePointerClick, ArrowUpRight, ChevronDown, ChevronRight } from 'lucide-react';
import { useViewerStore } from '../viewerStore';
import { Row } from './Row';
import { Chip } from '../../components/ui/Chip';

type InspectorTab = 'properties' | 'material' | 'geometry' | 'raw';

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'properties', label: 'Properties' },
  { id: 'material', label: 'Material' },
  { id: 'geometry', label: 'Geometry' },
  { id: 'raw', label: 'Raw glTF' },
];

function formatVector(v: THREE.Vector3, digits = 2): string {
  return `${v.x.toFixed(digits)}, ${v.y.toFixed(digits)}, ${v.z.toFixed(digits)}`;
}

function formatEulerDegrees(e: THREE.Euler): string {
  const toDeg = THREE.MathUtils.radToDeg;
  return `${toDeg(e.x).toFixed(1)}°, ${toDeg(e.y).toFixed(1)}°, ${toDeg(e.z).toFixed(1)}°`;
}

function friendlyType(object: THREE.Object3D): string {
  if ((object as any).isInstancedMesh) return 'Instanced Mesh';
  if ((object as THREE.SkinnedMesh).isSkinnedMesh) return 'Skinned Mesh';
  if ((object as THREE.Mesh).isMesh) return 'Mesh';
  if ((object as THREE.Bone).isBone) return 'Bone';
  if ((object as THREE.Light).isLight) return object.type;
  if ((object as THREE.Camera).isCamera) return object.type;
  if (object.type === 'Group') return 'Group';
  return object.type || 'Object3D';
}

function getFlag(userData: Record<string, unknown>, key: string): unknown {
  for (const [k, v] of Object.entries(userData)) {
    if (k.toLowerCase() === key.toLowerCase()) return v;
  }
  return undefined;
}

const RUNTIME_FLAG_KEYS = ['isstatic', 'objectid', 'ishidden'];
const MAP_SLOTS = [
  { key: 'map', label: 'Base color' },
  { key: 'normalMap', label: 'Normal' },
  { key: 'roughnessMap', label: 'Roughness' },
  { key: 'metalnessMap', label: 'Metallic' },
  { key: 'aoMap', label: 'Ambient occlusion' },
  { key: 'emissiveMap', label: 'Emissive' },
  { key: 'alphaMap', label: 'Alpha' },
  { key: 'bumpMap', label: 'Bump' },
  { key: 'displacementMap', label: 'Displacement' },
  { key: 'clearcoatMap', label: 'Clearcoat' },
  { key: 'clearcoatNormalMap', label: 'Clearcoat normal' },
  { key: 'transmissionMap', label: 'Transmission' },
] as const;

function JsonTree({ data, depth }: { data: unknown; depth?: number }) {
  const isObject = data !== null && typeof data === 'object' && !Array.isArray(data);
  const isArray = Array.isArray(data);

  if (!isObject && !isArray) {
    const val = data === null ? 'null' : typeof data === 'string' ? `"${data}"` : String(data);
    return <span className="text-accent-strong">{val}</span>;
  }

  return <JsonTreeNode data={data as Record<string, unknown> | unknown[]} depth={depth ?? 0} />;
}

function JsonTreeNode({ data, depth }: { data: Record<string, unknown> | unknown[]; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isArray = Array.isArray(data);
  const entries = isArray ? data.map((v, i) => [String(i), v] as const) : Object.entries(data);
  const isEmpty = entries.length === 0;

  return (
    <div style={{ paddingLeft: depth * 12 }} className="font-mono text-[11px] leading-relaxed">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1 text-ink-faint hover:text-ink"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="text-ink-muted">{isArray ? `Array(${data.length})` : isEmpty ? '{}' : `{...}`}</span>
      </button>
      {expanded && !isEmpty && (
        <div className="border-l border-hairline/60 pl-2">
          {entries.map(([key, value]) => (
            <div key={key}>
              <span className="text-icon-camera">{key}</span>
              <span className="text-ink-faint">: </span>
              <JsonTree data={value} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
      {expanded && isEmpty && <span className="text-ink-faint"> empty</span>}
    </div>
  );
}

function PropertiesTab({ object }: { object: THREE.Object3D }) {
  const wireframe = useViewerStore((s) => s.wireframe);
  const userData = (object.userData ?? {}) as Record<string, unknown>;
  const mesh = (object as THREE.Mesh).isMesh ? (object as THREE.Mesh) : null;

  const worldPosition = new THREE.Vector3();
  object.getWorldPosition(worldPosition);

  const worldScale = new THREE.Vector3();
  const parent = object.parent;
  if (parent) {
    const tempMatrix = new THREE.Matrix4().compose(object.position, object.quaternion, object.scale);
    parent.updateWorldMatrix(true, false);
    const worldMatrix = tempMatrix.premultiply(parent.matrixWorld);
    worldScale.setFromMatrixScale(worldMatrix);
  } else {
    worldScale.copy(object.scale);
  }

  const extras = Object.entries(userData).filter(
    ([key]) => !RUNTIME_FLAG_KEYS.includes(key.toLowerCase()),
  );

  const isStatic = getFlag(userData, 'isStatic');
  const objectId = getFlag(userData, 'ObjectID');
  const isHidden = getFlag(userData, 'isHidden');
  const hasRuntimeFlags = isStatic !== undefined || objectId !== undefined || isHidden !== undefined;

  return (
    <div className="space-y-3">
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
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-faint">Transform (local)</p>
        <Row label="Position" value={formatVector(object.position)} />
        <Row label="Rotation" value={formatEulerDegrees(object.rotation)} />
        <Row label="Scale" value={formatVector(object.scale)} />
      </div>

      <div className="rounded-lg border border-hairline bg-canvas-raised/60 p-2.5">
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-faint">World space</p>
        <Row label="Position" value={formatVector(worldPosition)} />
        <Row label="Scale" value={formatVector(worldScale)} />
      </div>

      {mesh && (mesh as any).isInstancedMesh && (
        <div className="rounded-lg border border-hairline bg-canvas-raised/60 p-2.5">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-faint">Instancing</p>
          <Row label="Instance count" value={String((mesh as THREE.InstancedMesh).count)} />
          <Row label="Vertices (per instance)" value={String(mesh.geometry.attributes.position?.count ?? 0)} />
        </div>
      )}

      {hasRuntimeFlags && (
        <div className="rounded-lg border border-hairline bg-canvas-raised/60 p-2.5">
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-faint">Runtime properties</p>
          <div className="space-y-0.5">
            {isStatic !== undefined && (
              <div className="flex items-center justify-between py-0.5">
                <span className="text-xs text-ink-faint">isStatic</span>
                <Chip tone={isStatic ? 'success' : 'neutral'}>{String(isStatic)}</Chip>
              </div>
            )}
            {objectId !== undefined && (
              <Row label="Object ID" value={String(objectId)} />
            )}
            {isHidden !== undefined && (
              <div className="flex items-center justify-between py-0.5">
                <span className="text-xs text-ink-faint">isHidden</span>
                <Chip tone={isHidden ? 'warning' : 'neutral'}>{String(isHidden)}</Chip>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-hairline bg-canvas-raised/60 p-2.5">
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-faint">Extra object data</p>
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

function MaterialTab({ object }: { object: THREE.Object3D }) {
  const mesh = (object as THREE.Mesh).isMesh ? (object as THREE.Mesh) : null;
  const setHighlightedMaterial = useViewerStore((s) => s.setHighlightedMaterial);

  if (!mesh) return <p className="text-xs text-ink-faint py-4 text-center">Not a mesh — no material data.</p>;

  const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">
        {meshMaterials.length} material{meshMaterials.length === 1 ? '' : 's'}
      </p>
      {meshMaterials.map((material) => {
        const m = material as unknown as Record<string, unknown>;
        const color = 'color' in material && (material as any).color instanceof THREE.Color
          ? `#${(material as any).color.getHexString()}`
          : null;
        const emissive = 'emissive' in material && (material as any).emissive instanceof THREE.Color
          ? `#${(material as any).emissive.getHexString()}`
          : null;

        return (
          <div key={material.uuid} className="rounded-lg border border-hairline bg-canvas-raised/60 p-2.5 space-y-2">
            <div className="flex items-center gap-2.5">
              <div
                className="h-5 w-5 shrink-0 rounded-full border border-white/15"
                style={{
                  background: color ?? 'repeating-conic-gradient(#3a3a44 0% 25%, #26262d 0% 50%) 50% / 8px 8px',
                }}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-ink">{material.name || '(unnamed)'}</p>
                <p className="text-[10px] text-ink-faint">{material.type}</p>
              </div>
              <button
                type="button"
                onClick={() => setHighlightedMaterial(material.uuid)}
                title="Highlight in viewport"
                className="shrink-0 rounded p-0.5 text-ink-faint hover:text-ink"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <Row label="Base color" value={color ?? '--'} />
            <Row label="Metalness" value={'metalness' in material ? (material as any).metalness.toFixed(3) : '--'} />
            <Row label="Roughness" value={'roughness' in material ? (material as any).roughness.toFixed(3) : '--'} />
            {emissive && <Row label="Emissive" value={emissive} />}
            <Row label="Opacity" value={material.opacity.toFixed(2)} />
            <Row label="Alpha mode" value={material.transparent ? 'Blend' : 'Opaque'} />
            <Row
              label="Double sided"
              value={material.side === THREE.DoubleSide ? 'Yes' : material.side === THREE.BackSide ? 'Back only' : 'Front'}
            />

            <div className="border-t border-hairline pt-2">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint">Texture maps</p>
              <div className="space-y-0.5">
                {MAP_SLOTS.map(({ key, label }) => {
                  const tex = m[key];
                  if (!tex) return null;
                  const texture = tex as THREE.Texture;
                  const imageWidth = (texture.image as { width?: number })?.width;
                  const imageHeight = (texture.image as { height?: number })?.height;
                  return (
                    <Row
                      key={key}
                      label={label}
                      value={
                        <span className="tabular-nums">
                          {imageWidth && imageHeight ? `${imageWidth}\u00D7${imageHeight}` : texture.name || 'present'}
                        </span>
                      }
                    />
                  );
                })}
              </div>
            </div>

            {material.userData && Object.keys(material.userData).length > 0 && (
              <div className="border-t border-hairline pt-2">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint">Extensions</p>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(material.userData).map((ext) => (
                    <Chip key={ext} tone="lilac">{ext}</Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function GeometryTab({ object }: { object: THREE.Object3D }) {
  const mesh = (object as THREE.Mesh).isMesh ? (object as THREE.Mesh) : null;

  if (!mesh) return <p className="text-xs text-ink-faint py-4 text-center">Not a mesh — no geometry data.</p>;

  const geometry = mesh.geometry;
  const vertCount = geometry.attributes.position?.count ?? 0;
  const triCount = geometry.index
    ? Math.round(geometry.index.count / 3)
    : Math.round(vertCount / 3);

  const box = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  const uvSets = ['uv', 'uv2', 'uv3', 'uv4'].filter((key) => geometry.attributes[key]);
  const morphTargets = mesh.morphTargetInfluences?.length ?? 0;
  const isSkinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh === true;
  const boneCount = isSkinned ? (mesh as THREE.SkinnedMesh).skeleton?.bones.length ?? 0 : 0;

  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-wide text-ink-faint">Mesh geometry</p>

      <div className="rounded-lg border border-hairline bg-canvas-raised/60 p-2.5 space-y-0.5">
        <Row label="Vertices" value={vertCount.toLocaleString()} />
        <Row label="Triangles" value={triCount.toLocaleString()} />
        <Row label="Indexed" value={geometry.index ? 'Yes' : 'No'} />
        <Row label="Attributes" value={Object.keys(geometry.attributes).join(', ')} />
        <Row label="UV sets" value={uvSets.length > 0 ? uvSets.join(', ') : 'None'} />
        {morphTargets > 0 && (
          <>
            <Row label="Morph targets" value={String(morphTargets)} />
            <Row label="Morph target keys" value={Object.keys(mesh.morphTargetDictionary ?? {}).join(', ') || '--'} />
          </>
        )}
        {isSkinned && (
          <>
            <div className="my-1 border-t border-hairline" />
            <Row label="Bone count" value={String(boneCount)} />
            <Row label="Bind matrix" value='auto' />
          </>
        )}
      </div>

      <div className="rounded-lg border border-hairline bg-canvas-raised/60 p-2.5 space-y-0.5">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-ink-faint">Bounding box</p>
        <Row label="Min" value={`${box.min.x.toFixed(2)}, ${box.min.y.toFixed(2)}, ${box.min.z.toFixed(2)}`} />
        <Row label="Max" value={`${box.max.x.toFixed(2)}, ${box.max.y.toFixed(2)}, ${box.max.z.toFixed(2)}`} />
        <Row label="Size" value={`${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)}`} />
        <Row label="Center" value={`${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}`} />
      </div>
    </div>
  );
}

function RawTab({ object }: { object: THREE.Object3D }) {
  const data = {
    name: object.name,
    type: friendlyType(object),
    uuid: object.uuid,
    position: object.position.toArray(),
    rotation: object.rotation.toArray(),
    scale: object.scale.toArray(),
    visible: object.visible,
    children: object.children.length,
    userData: object.userData,
  };

  return (
    <div className="rounded-lg border border-hairline bg-canvas-raised/60 p-2.5">
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-faint">Node definition</p>
      <div className="overflow-x-auto">
        <JsonTree data={data} />
      </div>
    </div>
  );
}

const TAB_CONTENT: Record<InspectorTab, (object: THREE.Object3D) => React.ReactNode> = {
  properties: (obj) => <PropertiesTab object={obj} />,
  material: (obj) => <MaterialTab object={obj} />,
  geometry: (obj) => <GeometryTab object={obj} />,
  raw: (obj) => <RawTab object={obj} />,
};

export function InspectorPanel() {
  const gltf = useViewerStore((s) => s.gltf);
  const selectedUuid = useViewerStore((s) => s.selectedUuid);
  const [tab, setTab] = useState<InspectorTab>('properties');

  const object = useMemo(() => {
    if (!gltf || !selectedUuid) return null;
    return gltf.scene.getObjectByProperty('uuid', selectedUuid) ?? null;
  }, [gltf, selectedUuid]);

  if (!object) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <MousePointerClick className="h-5 w-5 text-ink-faint" />
        <p className="text-sm text-ink-muted">No object selected</p>
        <p className="text-xs text-ink-faint">Click an object in the viewport or the hierarchy to inspect it.</p>
      </div>
    );
  }

  const isMesh = (object as THREE.Mesh).isMesh;

  return (
    <div>
      <div className="mb-2 flex gap-0.5 rounded-lg border border-hairline bg-surface-soft p-0.5">
        {TABS.map((t) => {
          const disabled = !isMesh && (t.id === 'material' || t.id === 'geometry');
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && setTab(t.id)}
              className={`flex-1 rounded-md px-1.5 py-1 text-[10px] font-medium transition ${
                active
                  ? 'bg-canvas-raised text-ink'
                  : disabled
                    ? 'cursor-not-allowed text-ink-faint/30'
                    : 'text-ink-faint hover:text-ink-muted'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2">{TAB_CONTENT[tab](object)}</div>
    </div>
  );
}
