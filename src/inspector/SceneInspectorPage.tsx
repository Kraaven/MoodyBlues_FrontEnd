import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useVirtualizer } from '@tanstack/react-virtual';
import * as THREE from 'three';
import { Box, Boxes, Camera, ChevronDown, ChevronRight, Grid3x3, Lightbulb, Maximize, MousePointerClick, Search } from 'lucide-react';
import { useProject, useScene } from '../api/queries';
import type { SceneVersion } from '../api/types';
import { AppShell } from '../shell/AppShell';
import { IconButton } from '../ui/Button';
import { VersionChip } from '../ui/Chip';
import { ErrorState, SectionLabel } from '../ui/States';
import { SegmentTabs } from '../ui/Tabs';
import { cn } from '../ui/cn';
import { formatBytes, formatCount, plural, sceneTitle } from '../lib/format';
import { disposeObject3D, frameObject } from '../viewer/core/gltf';
import { loadSceneGltf } from '../stage/sceneSource';
import { SelectionOutline } from '../viewer/core/SelectionOutline';
import { Stage } from '../viewer/Stage';
import { colorHex, inspectScene, nodeType, TEXTURE_SLOTS, triangleCount, type SceneInspection } from './inspection';

type Tab = 'hierarchy' | 'materials' | 'stats';

/** The scene inspector (DESIGN.md 7.7): the player's layout without a timeline. */
export default function SceneInspectorPage() {
  const { projectId, sceneId } = useParams<{ projectId: string; sceneId: string }>();
  const [params] = useSearchParams();
  const project = useProject(projectId);
  const scene = useScene(project.data?.developerId, sceneId);
  const [root, setRoot] = useState<THREE.Object3D | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [progress, setProgress] = useState<[number, number | null]>([0, null]);
  const [selected, setSelected] = useState<THREE.Object3D | null>(null);
  const [tab, setTab] = useState<Tab>('hierarchy');
  const [grid, setGrid] = useState(true);
  const [frameToken, setFrameToken] = useState(0);

  const requested = Number(params.get('version'));
  const version: SceneVersion | null = useMemo(() => {
    if (!scene.data) return null;
    const all = [scene.data.current, ...scene.data.archived].filter((v): v is SceneVersion => v !== null);
    return all.find((v) => v.version === requested) ?? scene.data.current;
  }, [scene.data, requested]);

  const inspection = useMemo(() => (root ? inspectScene(root) : null), [root]);
  const base = `/projects/${projectId}/scenes/${encodeURIComponent(sceneId ?? '')}`;
  const crumbs = [
    { label: 'Projects', to: '/projects' },
    { label: project.data?.name ?? 'Project', to: `/projects/${projectId}` },
    { label: scene.data ? sceneTitle(scene.data) : 'Scene', to: base },
    { label: version ? `Inspect v${version.version}` : 'Inspect' },
  ];

  const error = project.error ?? scene.error ?? loadError;

  return (
    <AppShell crumbs={crumbs} fullBleed>
      <div className="flex h-full min-h-0">
        <div className="relative min-w-0 flex-1">
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <ErrorState error={error} title="The scene did not load" className="max-w-lg" onRetry={() => window.location.reload()} />
            </div>
          ) : project.data && version ? (
            <>
              <Stage grid={grid} className="absolute inset-0">
                <InspectedScene
                  developerId={project.data.developerId}
                  sceneId={sceneId!}
                  hash={version.hash}
                  selected={selected}
                  frameToken={frameToken}
                  onLoaded={setRoot}
                  onSelect={setSelected}
                  onProgress={(r, t) => setProgress([r, t])}
                  onError={setLoadError}
                />
              </Stage>
              {!root && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-72 space-y-3 text-center">
                    <p className="text-[13px] text-fg-2">
                      Downloading the scene
                      {progress[0] > 0 && <span className="tabular text-fg-3"> · {formatBytes(progress[0])}</span>}
                    </p>
                    <div className="h-1 overflow-hidden rounded-full bg-ink-3">
                      {progress[1] ? (
                        <div className="h-full bg-gradient-to-r from-blue to-blue-bright" style={{ width: `${(progress[0] / progress[1]) * 100}%` }} />
                      ) : (
                        <div className="shimmer h-full" />
                      )}
                    </div>
                  </div>
                </div>
              )}
              <div className="glass elevated absolute left-3 top-3 flex items-center gap-2 rounded-[var(--radius-card)] border border-rule px-2.5 py-1.5">
                <VersionChip version={version.version} current={version.isCurrent} />
                <span className="text-[12px] text-fg-3">{formatBytes(version.sizeBytes)}</span>
              </div>
              <div className="glass elevated absolute right-3 top-3 flex items-center gap-0.5 rounded-[var(--radius-card)] border border-rule p-1">
                <IconButton label="Frame the whole scene" size="sm" onClick={() => setFrameToken((n) => n + 1)}>
                  <Maximize className="h-4 w-4" />
                </IconButton>
                <IconButton label={grid ? 'Hide grid' : 'Show grid'} size="sm" active={grid} onClick={() => setGrid((g) => !g)}>
                  <Grid3x3 className="h-4 w-4" />
                </IconButton>
              </div>
            </>
          ) : null}
        </div>

        <aside className="flex w-[360px] shrink-0 flex-col border-l border-rule bg-ink-1">
          <div className="border-b border-rule p-2">
            <SegmentTabs
              value={tab}
              onChange={setTab}
              items={[
                { id: 'hierarchy', label: 'Hierarchy' },
                { id: 'materials', label: 'Materials', badge: inspection ? inspection.materials.length : undefined },
                { id: 'stats', label: 'Stats' },
              ]}
            />
          </div>
          {!root || !inspection ? (
            <p className="p-4 text-[13px] text-fg-2">The scene is still loading.</p>
          ) : tab === 'hierarchy' ? (
            <HierarchyTab root={root} selected={selected} onSelect={setSelected} />
          ) : tab === 'materials' ? (
            <MaterialsTab inspection={inspection} onSelect={(mesh) => setSelected(mesh)} />
          ) : (
            <StatsTab inspection={inspection} version={version} />
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function InspectedScene({
  developerId,
  sceneId,
  hash,
  selected,
  frameToken,
  onLoaded,
  onSelect,
  onProgress,
  onError,
}: {
  developerId: string;
  sceneId: string;
  hash: string;
  selected: THREE.Object3D | null;
  frameToken: number;
  onLoaded: (root: THREE.Object3D | null) => void;
  onSelect: (node: THREE.Object3D | null) => void;
  onProgress: (received: number, total: number | null) => void;
  onError: (err: unknown) => void;
}) {
  const { gl, camera, scene } = useThree();
  const controls = useRef<OrbitControlsImpl | null>(null);
  const rootRef = useRef<THREE.Object3D | null>(null);
  const callbacks = useRef({ onLoaded, onSelect, onProgress, onError });
  callbacks.current = { onLoaded, onSelect, onProgress, onError };

  useEffect(() => {
    const controller = new AbortController();
    loadSceneGltf(gl, developerId, sceneId, hash, (r, t) => callbacks.current.onProgress(r, t), controller.signal)
      .then((gltf) => {
        if (controller.signal.aborted) return disposeObject3D(gltf.scene);
        rootRef.current = gltf.scene;
        scene.add(gltf.scene);
        frameObject(camera as THREE.PerspectiveCamera, controls.current?.target ?? null, gltf.scene, { direction: new THREE.Vector3(1, 0.7, 1.2) });
        controls.current?.update();
        callbacks.current.onLoaded(gltf.scene);
      })
      .catch((err) => !controller.signal.aborted && callbacks.current.onError(err));
    return () => {
      controller.abort();
      if (rootRef.current) {
        scene.remove(rootRef.current);
        disposeObject3D(rootRef.current);
        rootRef.current = null;
      }
      callbacks.current.onLoaded(null);
    };
  }, [gl, camera, scene, developerId, sceneId, hash]);

  useEffect(() => {
    if (frameToken === 0 || !rootRef.current) return;
    frameObject(camera as THREE.PerspectiveCamera, controls.current?.target ?? null, rootRef.current);
    controls.current?.update();
  }, [frameToken, camera]);

  useEffect(() => {
    const dom = gl.domElement;
    const raycaster = new THREE.Raycaster();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!down || !root || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
      down = null;
      const rect = dom.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
      const hit = raycaster.intersectObject(root, true).find((h) => {
        for (let n: THREE.Object3D | null = h.object; n; n = n.parent) if (!n.visible) return false;
        return true;
      });
      callbacks.current.onSelect(hit?.object ?? null);
    };
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointerup', onUp);
    return () => {
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointerup', onUp);
    };
  }, [gl, camera]);

  return (
    <>
      <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.08} />
      <SelectionOutline object={selected} />
    </>
  );
}

// ---- Hierarchy ----------------------------------------------------------------------------------

interface Row {
  node: THREE.Object3D;
  depth: number;
  hasChildren: boolean;
  dim: boolean;
}

function iconFor(node: THREE.Object3D) {
  if ((node as THREE.Camera).isCamera) return Camera;
  if ((node as THREE.Light).isLight) return Lightbulb;
  if ((node as THREE.Mesh).isMesh) return Box;
  return Boxes;
}

function HierarchyTab({ root, selected, onSelect }: { root: THREE.Object3D; selected: THREE.Object3D | null; onSelect: (n: THREE.Object3D | null) => void }) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const needle = query.trim().toLowerCase();
    const matches = (n: THREE.Object3D): boolean => n.name.toLowerCase().includes(needle) || n.children.some(matches);
    const visit = (n: THREE.Object3D, depth: number, dim: boolean) => {
      if (needle && !matches(n)) return;
      const hidden = dim || !n.visible;
      out.push({ node: n, depth, hasChildren: n.children.length > 0, dim: hidden });
      if (needle || !collapsed.has(n.uuid)) for (const c of n.children) visit(c, depth + 1, hidden);
    };
    for (const c of root.children) visit(c, 0, false);
    return out;
  }, [root, collapsed, query]);

  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => 28, overscan: 20 });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-rule p-3">
        <label className="flex h-8 items-center gap-2 rounded-[var(--radius-control)] border border-rule-strong bg-ink-2 px-2.5 focus-within:border-blue">
          <Search className="h-3.5 w-3.5 shrink-0 text-fg-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes"
            className="w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-3"
          />
        </label>
      </div>
      <div ref={scrollRef} role="tree" aria-label="Hierarchy" className="min-h-0 flex-1 overflow-y-auto py-1">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            const Icon = iconFor(row.node);
            const isCollapsed = collapsed.has(row.node.uuid);
            const id = row.node.userData?.objectId;
            return (
              <div
                key={row.node.uuid}
                role="treeitem"
                aria-selected={row.node === selected}
                onClick={() => onSelect(row.node === selected ? null : row.node)}
                className={cn(
                  'absolute left-0 right-0 flex h-7 cursor-pointer items-center gap-1.5 pr-3 text-[13px]',
                  row.node === selected ? 'bg-blue/15 text-fg shadow-[inset_2px_0_0_var(--color-blue)]' : 'text-fg-2 hover:bg-ink-2 hover:text-fg',
                  row.dim && 'opacity-45',
                )}
                style={{ transform: `translateY(${item.start}px)`, paddingLeft: 8 + row.depth * 14 }}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(row.node.uuid)) next.delete(row.node.uuid);
                      else next.add(row.node.uuid);
                      return next;
                    });
                  }}
                  className={cn('flex h-4 w-4 items-center justify-center text-fg-3', !row.hasChildren && 'invisible')}
                >
                  {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                <Icon className="h-3.5 w-3.5 shrink-0 text-fg-3" />
                <span className="min-w-0 flex-1 truncate">{row.node.name || `(${nodeType(row.node)})`}</span>
                {typeof id === 'number' && <span className="tabular font-mono text-[11px] text-fg-3">#{id}</span>}
              </div>
            );
          })}
        </div>
      </div>
      {selected ? <NodeDetails node={selected} /> : (
        <div className="flex shrink-0 items-center gap-2 border-t border-rule p-4 text-[13px] text-fg-3">
          <MousePointerClick className="h-4 w-4" />
          Click an object in the view or the list to inspect it.
        </div>
      )}
    </div>
  );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-fg-3">{k}</dt>
          <dd className="tabular truncate text-right font-mono text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function NodeDetails({ node }: { node: THREE.Object3D }) {
  const v = (x: THREE.Vector3) => `${x.x.toFixed(3)}, ${x.y.toFixed(3)}, ${x.z.toFixed(3)}`;
  const e = new THREE.Euler().setFromQuaternion(node.quaternion);
  const deg = `${[e.x, e.y, e.z].map((r) => THREE.MathUtils.radToDeg(r).toFixed(1)).join('°, ')}°`;
  const world = new THREE.Vector3();
  node.getWorldPosition(world);
  const mesh = (node as THREE.Mesh).isMesh ? (node as THREE.Mesh) : null;
  const extras = Object.entries(node.userData ?? {}).filter(([k]) => k !== 'objectId' && k !== 'isHidden');

  return (
    <div className="max-h-[45%] shrink-0 space-y-4 overflow-y-auto border-t border-rule p-4">
      <div>
        <p className="truncate text-[14px] font-semibold text-fg">{node.name || '(unnamed)'}</p>
        <p className="text-[12px] text-fg-3">
          {nodeType(node)}
          {typeof node.userData?.objectId === 'number' && <span className="font-mono"> · #{node.userData.objectId}</span>}
          {node.userData?.isHidden === true && ' · inactive at start'}
        </p>
      </div>
      <div className="space-y-1.5">
        <SectionLabel>Transform (local)</SectionLabel>
        <Rows rows={[['Position', v(node.position)], ['Rotation', deg], ['Scale', v(node.scale)]]} />
      </div>
      <div className="space-y-1.5">
        <SectionLabel>World</SectionLabel>
        <Rows rows={[['Position', v(world)]]} />
      </div>
      {mesh && (
        <div className="space-y-1.5">
          <SectionLabel>Geometry</SectionLabel>
          <Rows
            rows={[
              ['Vertices', formatCount(mesh.geometry.attributes.position?.count ?? 0)],
              ['Triangles', formatCount(triangleCount(mesh.geometry))],
              ['Materials', (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m.name || m.type).join(', ')],
            ]}
          />
        </div>
      )}
      {extras.length > 0 && (
        <div className="space-y-1.5">
          <SectionLabel>Extras</SectionLabel>
          <Rows rows={extras.map(([k, val]) => [k, typeof val === 'object' ? JSON.stringify(val) : String(val)])} />
        </div>
      )}
    </div>
  );
}

// ---- Materials ----------------------------------------------------------------------------------

function MaterialsTab({ inspection, onSelect }: { inspection: SceneInspection; onSelect: (mesh: THREE.Mesh) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (inspection.materials.length === 0) return <p className="p-4 text-[13px] text-fg-2">This scene has no materials.</p>;

  return (
    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
      {inspection.materials.map(({ material, users }) => {
        const color = colorHex(material, 'color');
        const isOpen = open === material.uuid;
        const m = material as unknown as Record<string, unknown>;
        return (
          <div key={material.uuid} className="rounded-[var(--radius-card)] border border-rule bg-ink-2/50">
            <button type="button" onClick={() => setOpen(isOpen ? null : material.uuid)} className="flex w-full items-center gap-3 px-3 py-2 text-left">
              <span
                className="h-7 w-7 shrink-0 rounded-full border border-white/15"
                style={{ background: color ?? 'repeating-conic-gradient(#273866 0% 25%, #151e36 0% 50%) 50% / 8px 8px' }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-fg">{material.name || '(unnamed material)'}</span>
                <span className="text-[12px] text-fg-3">used by {plural(users.length, 'mesh', 'meshes')}</span>
              </span>
              {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-fg-3" /> : <ChevronRight className="h-3.5 w-3.5 text-fg-3" />}
            </button>
            {isOpen && (
              <div className="space-y-3 border-t border-rule px-3 py-3">
                <Rows
                  rows={[
                    ['Type', material.type],
                    ['Base color', color ?? '—'],
                    ['Metalness', typeof m.metalness === 'number' ? (m.metalness as number).toFixed(2) : '—'],
                    ['Roughness', typeof m.roughness === 'number' ? (m.roughness as number).toFixed(2) : '—'],
                    ['Emissive', colorHex(material, 'emissive') ?? '—'],
                    ['Opacity', material.opacity.toFixed(2)],
                    ['Alpha', material.transparent ? 'Blend' : material.alphaTest > 0 ? 'Mask' : 'Opaque'],
                    ['Double sided', material.side === THREE.DoubleSide ? 'Yes' : 'No'],
                    ...TEXTURE_SLOTS.filter(({ key }) => m[key]).map(({ key, label }): [string, string] => {
                      const image = (m[key] as THREE.Texture).image as { width?: number; height?: number } | undefined;
                      return [label, image?.width ? `${image.width}×${image.height}` : 'yes'];
                    }),
                  ]}
                />
                <div className="flex flex-wrap gap-1.5">
                  {users.slice(0, 12).map((mesh) => (
                    <button
                      key={mesh.uuid}
                      type="button"
                      onClick={() => onSelect(mesh)}
                      className="max-w-full truncate rounded-[5px] border border-rule-strong px-1.5 py-0.5 text-[11px] text-fg-2 hover:border-blue/50 hover:text-fg"
                    >
                      {mesh.name || 'mesh'}
                    </button>
                  ))}
                  {users.length > 12 && <span className="text-[11px] text-fg-3">and {users.length - 12} more</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Stats --------------------------------------------------------------------------------------

function StatsTab({ inspection: s, version }: { inspection: SceneInspection; version: SceneVersion | null }) {
  const groups: [string, [string, string][]][] = [
    [
      'Objects',
      [
        ['Nodes', formatCount(s.nodeCount)],
        ['Tracked (with an ObjectID)', formatCount(s.trackedCount)],
        ['Inactive at start', formatCount(s.hiddenCount)],
        ['Cameras', formatCount(s.cameraCount)],
        ['Lights', formatCount(s.lightCount)],
      ],
    ],
    [
      'Geometry',
      [
        ['Meshes', formatCount(s.meshCount)],
        ['Skinned meshes', formatCount(s.skinnedMeshCount)],
        ['Vertices', formatCount(s.vertexCount)],
        ['Triangles', formatCount(s.triangleCount)],
      ],
    ],
    [
      'Assets',
      [
        ['Materials', formatCount(s.materials.length)],
        ['Textures', formatCount(s.textures.length)],
        ['File size', version ? formatBytes(version.sizeBytes) : '—'],
        ['Meshes missing from the export', version ? formatCount(version.skippedMeshCount) : '—'],
      ],
    ],
  ];
  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
      {groups.map(([title, rows]) => (
        <div key={title} className="space-y-2">
          <SectionLabel>{title}</SectionLabel>
          <Rows rows={rows} />
        </div>
      ))}
    </div>
  );
}
