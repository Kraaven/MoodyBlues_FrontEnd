import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Box, TriangleAlert } from 'lucide-react';
import type { SceneVersion } from '../../api/types';
import { collectGeometries, inspectScene, triangleCount } from '../../inspector/inspection';
import { useStage } from '../../stage/store';
import { formatBytes, formatCompact, formatCount, plural } from '../../lib/format';
import { useStudio } from '../studioStore';
import { EmptyNote, ObjectHeading, Row, Rule, SectionTitle, WindowBody } from './parts';

const ATTRIBUTE_NAMES: Record<string, string> = {
  position: 'Position',
  normal: 'Normal',
  uv: 'UV0',
  uv1: 'UV1',
  uv2: 'UV2',
  tangent: 'Tangent',
  color: 'Color',
  skinIndex: 'Joints',
  skinWeight: 'Weights',
};

function meshOf(node: THREE.Object3D | null): THREE.Mesh | null {
  if (!node) return null;
  if ((node as THREE.Mesh).isMesh) return node as THREE.Mesh;
  let found: THREE.Mesh | null = null;
  node.traverse((n) => {
    if (!found && (n as THREE.Mesh).isMesh) found = n as THREE.Mesh;
  });
  return found;
}

function size(geometry: THREE.BufferGeometry): string {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const s = geometry.boundingBox!.getSize(new THREE.Vector3());
  const f = (n: number) => (n >= 10 ? n.toFixed(0) : n >= 1 ? Number(n.toFixed(1)).toString() : Number(n.toFixed(2)).toString());
  return `${f(s.x)} × ${f(s.y)} × ${f(s.z)} m`;
}

/** The selected object's mesh, or, with nothing selected, what the whole scene costs to draw. */
export function GeometryWindow({ version }: { version: SceneVersion | null }) {
  const selected = useStudio((s) => s.selected);
  const master = useStudio((s) => s.master);
  const stats = useStage((s) => s.stats);
  const mesh = meshOf(selected);
  const scene = useMemo(() => (master ? inspectScene(master) : null), [master]);
  const geometries = useMemo(() => (master ? collectGeometries(master) : null), [master]);

  // Draw statistics are only gathered while this window is open.
  useEffect(() => {
    useStage.getState().setStatsEnabled(true);
    return () => useStage.getState().setStatsEnabled(false);
  }, []);

  if (!scene || !geometries) return <EmptyNote>The scene is still loading.</EmptyNote>;

  if (mesh) {
    const g = mesh.geometry;
    const attributes = Object.keys(g.attributes);
    const hasNormals = 'normal' in g.attributes;
    const hasUv = 'uv' in g.attributes;
    return (
      <WindowBody>
        <ObjectHeading icon={<Box className="h-9 w-9" strokeWidth={1.5} />} name={g.name || mesh.name || 'Mesh'} kind={`${selected?.name || mesh.name || 'Object'} / ${(mesh as THREE.SkinnedMesh).isSkinnedMesh ? 'Skinned mesh' : 'Mesh'}`} />
        <Rule />
        <dl>
          <Row label="Vertices">{formatCount(g.attributes.position?.count ?? 0)}</Row>
          <Row label="Triangles">{formatCount(triangleCount(g))}</Row>
          <Row label="Submeshes">{Math.max(1, g.groups.length)}</Row>
          <Row label="Index format">{g.index ? (g.index.array instanceof Uint32Array ? 'UInt32' : 'UInt16') : 'None'}</Row>
          <Row label="Bounds">{size(g)}</Row>
          <Row label="Shared by">{plural(geometries.find((x) => x.geometry === g)?.meshes.length ?? 1, 'mesh', 'meshes')}</Row>
        </dl>
        <Rule />
        <SectionTitle>Attributes</SectionTitle>
        <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-[14px] text-fg">
          {attributes.map((a) => (
            <span key={a} title={`${g.attributes[a].itemSize} × ${formatCount(g.attributes[a].count)}`}>
              {ATTRIBUTE_NAMES[a] ?? a}
            </span>
          ))}
        </div>
        <p className="mt-4 text-[14px] text-fg-2">{hasNormals && hasUv ? 'Normals and UVs available' : hasNormals ? 'Normals, no UVs' : 'No normals: lighting may look flat'}</p>
      </WindowBody>
    );
  }

  return (
    <WindowBody>
      <SectionTitle>This scene</SectionTitle>
      <dl>
        <Row label="Objects">{formatCount(scene.nodeCount)}</Row>
        <Row label="Tracked (ObjectID)">{formatCount(scene.trackedCount)}</Row>
        <Row label="Meshes">{formatCount(scene.meshCount)}</Row>
        <Row label="Unique geometries">{formatCount(geometries.length)}</Row>
        <Row label="Triangles">{formatCompact(scene.triangleCount)}</Row>
        <Row label="Vertices">{formatCompact(scene.vertexCount)}</Row>
        {version && <Row label="File size">{formatBytes(version.sizeBytes)}</Row>}
      </dl>
      <Rule />
      <SectionTitle>Drawing it now</SectionTitle>
      <dl>
        <Row label="Draw calls">{stats ? formatCount(stats.calls) : '…'}</Row>
        <Row label="Triangles drawn">{stats ? formatCompact(stats.triangles) : '…'}</Row>
        <Row label="Frame time">{stats ? `${stats.avgMs.toFixed(1)} ms` : '…'}</Row>
      </dl>
      {version && version.skippedMeshCount > 0 && (
        <div className="mt-6 flex gap-3 rounded-[8px] border border-caution/30 bg-caution/8 p-4">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-caution" />
          <div className="text-[13px] leading-5 text-fg-2">
            <p className="text-fg">{plural(version.skippedMeshCount, 'mesh', 'meshes')} left out of this export.</p>
            <p className="mt-1">
              Unity could not read them. Run <span className="text-fg">MoodyBlues &gt; Make Scene Meshes Readable</span> (or turn on Read/Write in their import settings) and export
              the scene again.
            </p>
          </div>
        </div>
      )}
      <Rule />
      <SectionTitle>Largest geometries</SectionTitle>
      <ul className="-mx-2 space-y-0.5">
        {geometries.slice(0, 12).map((g) => (
          <li key={g.id}>
            <button type="button" onClick={() => useStudio.getState().select(g.meshes[0])} className="flex w-full items-baseline justify-between gap-3 rounded-[6px] px-2 py-1.5 text-left hover:bg-ink-3">
              <span className="truncate text-[14px] text-fg">{g.name}</span>
              <span className="tabular shrink-0 font-mono text-[12px] text-fg-3">{formatCompact(g.triangleCount)} tris</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[13px] text-fg-3">Select an object to see its mesh.</p>
    </WindowBody>
  );
}
