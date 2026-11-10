import { useEffect, useMemo } from 'react';
import type { SceneVersion } from '../../api/types';
import { formatBytes, formatCount } from '../../lib/format';
import { sceneInfo } from '../../stage/sceneAssets';
import { useStage } from '../../stage/store';
import { SectionLabel } from '../../ui/States';
import { inspectScene, vertexStats } from '../inspection';
import { useInspector } from '../inspectorStore';
import { EmptyNote, Rows } from './shared';

export function StatsPanel({ version }: { version: SceneVersion | null }) {
  const root = useInspector((s) => s.root);
  const sceneRef = useStage((s) => s.view.scene);
  const stats = useStage((s) => s.stats);
  const inspection = useMemo(() => (root ? inspectScene(root) : null), [root]);
  const vertices = useMemo(() => (root ? vertexStats(root) : null), [root]);

  // Draw statistics are only gathered while this panel is on screen.
  useEffect(() => {
    useStage.getState().setStatsEnabled(true);
    return () => useStage.getState().setStatsEnabled(false);
  }, []);

  if (!inspection || !vertices) return <EmptyNote>The scene is still loading.</EmptyNote>;
  const info = sceneRef ? sceneInfo(sceneRef) : null;
  const json = info?.json as { extensionsUsed?: string[]; textures?: unknown[]; images?: unknown[]; accessors?: unknown[]; buffers?: unknown[] } | undefined;

  const groups: [string, [string, string][]][] = [
    [
      'Objects',
      [
        ['Nodes', formatCount(inspection.nodeCount)],
        ['Tracked (with an ObjectID)', formatCount(inspection.trackedCount)],
        ['Inactive at start', formatCount(inspection.hiddenCount)],
        ['Cameras', formatCount(inspection.cameraCount)],
        ['Lights', formatCount(inspection.lightCount)],
      ],
    ],
    [
      'Geometry',
      [
        ['Meshes', formatCount(inspection.meshCount)],
        ['Skinned meshes', formatCount(inspection.skinnedMeshCount)],
        ['Vertices (model)', formatCount(vertices.model)],
        ['Vertices (drawn once each)', formatCount(vertices.regular)],
        ['Vertices (instanced)', formatCount(vertices.instanced)],
        ['Triangles', formatCount(inspection.triangleCount)],
      ],
    ],
    [
      'Assets',
      [
        ['Materials', formatCount(inspection.materials.length)],
        ['Textures', formatCount(inspection.textures.length)],
        ['Animations in the file', info ? formatCount(info.animationCount) : '—'],
        ['Generator', info?.generator ?? '—'],
        ['File size', version ? formatBytes(version.sizeBytes) : '—'],
      ],
    ],
  ];
  if (json) {
    groups.push([
      'glTF',
      [
        ['Accessors', formatCount(json.accessors?.length ?? 0)],
        ['Images', formatCount(json.images?.length ?? 0)],
        ['Buffers', formatCount(json.buffers?.length ?? 0)],
        ['Extensions used', json.extensionsUsed?.length ? json.extensionsUsed.join(', ') : 'none'],
      ],
    ]);
  }
  groups.push([
    'Rendering now',
    stats
      ? [
          ['Draw calls', formatCount(stats.calls)],
          ['Triangles drawn', formatCount(stats.triangles)],
          ['Geometries on the GPU', formatCount(stats.geometries)],
          ['Textures on the GPU', formatCount(stats.textures)],
        ]
      : [['Draw calls', 'measuring…']],
  ]);

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
      {groups.map(([title, rows]) => (
        <div key={title} className="space-y-2">
          <SectionLabel>{title}</SectionLabel>
          <Rows rows={rows} />
        </div>
      ))}
      {version && version.skippedMeshCount > 0 && (
        <div className="rounded-[var(--radius-card)] border border-caution/40 bg-caution/10 p-3 text-[12px] text-fg-2">
          <p className="font-medium text-fg">{version.skippedMeshCount} meshes were left out of this export.</p>
          <p className="mt-1">
            Unity skipped meshes whose data is not readable. Turn on <span className="text-fg">Read/Write</span> in their import settings and export the scene again.
          </p>
        </div>
      )}
    </div>
  );
}
