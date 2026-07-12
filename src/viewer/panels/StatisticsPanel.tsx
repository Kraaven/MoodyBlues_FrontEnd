import { useMemo } from 'react';
import { Boxes, Cuboid, Film, HardDrive, Image, Layers, Spline, Triangle } from 'lucide-react';
import { useViewerStore } from '../viewerStore';
import { computeSceneStats } from '../sceneStats';
import { StatTile } from '../../components/ui/StatTile';
import { formatBytes, formatCount } from '../../lib/format';

export function StatisticsPanel() {
  const meshes = useViewerStore((s) => s.meshes);
  const materials = useViewerStore((s) => s.materials);
  const textures = useViewerStore((s) => s.textures);
  const clips = useViewerStore((s) => s.clips);
  const fileSizeBytes = useViewerStore((s) => s.fileSizeBytes);

  const stats = useMemo(
    () => computeSceneStats(meshes, materials.length, textures.length, clips),
    [meshes, materials.length, textures.length, clips],
  );

  return (
    <div className="grid grid-cols-2 gap-2">
      <StatTile label="Vertices" value={formatCount(stats.totalVertices)} icon={Spline} />
      <StatTile label="Triangles" value={formatCount(stats.totalTriangles)} icon={Triangle} />
      <StatTile label="Objects" value={formatCount(stats.objectCount)} icon={Boxes} />
      <StatTile
        label="Static objects"
        value={formatCount(stats.staticObjectCount)}
        icon={Cuboid}
        hint={`${stats.animatedObjectCount} animated`}
      />
      <StatTile label="Materials" value={formatCount(stats.materialCount)} icon={Layers} />
      <StatTile label="Textures" value={formatCount(stats.textureCount)} icon={Image} />
      <StatTile label="Animation clips" value={formatCount(stats.animationClipCount)} icon={Film} />
      <StatTile label="File size" value={fileSizeBytes ? formatBytes(fileSizeBytes) : '--'} icon={HardDrive} />
    </div>
  );
}
