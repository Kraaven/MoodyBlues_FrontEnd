import { useMemo, useState } from 'react';
import type * as THREE from 'three';
import { ChevronDown, ChevronRight, Search, Box, Bone, Camera, Lightbulb, Layers, Folder } from 'lucide-react';
import { useViewerStore } from '../viewerStore';

function nodeMatches(object: THREE.Object3D, query: string): boolean {
  if (!query) return true;
  if (object.name.toLowerCase().includes(query)) return true;
  return object.children.some((child) => nodeMatches(child, query));
}

function nodeIcon(object: THREE.Object3D) {
  const cls = 'h-3.5 w-3.5 shrink-0';
  if ((object as THREE.SkinnedMesh).isSkinnedMesh) return <Bone className={cls} style={{ color: 'var(--color-icon-skinned)' }} />;
  if ((object as THREE.Mesh).isMesh) {
    const mesh = object as THREE.Mesh;
    if ((mesh as any).isInstancedMesh) return <Layers className={cls} style={{ color: 'var(--color-icon-instanced)' }} />;
    return <Box className={cls} style={{ color: 'var(--color-icon-mesh)' }} />;
  }
  if ((object as THREE.Bone).isBone) return <Bone className={cls} style={{ color: 'var(--color-icon-bone)' }} />;
  if ((object as THREE.Camera).isCamera) return <Camera className={cls} style={{ color: 'var(--color-icon-camera)' }} />;
  if ((object as THREE.Light).isLight) return <Lightbulb className={cls} style={{ color: 'var(--color-icon-light)' }} />;
  return <Folder className={cls} style={{ color: 'var(--color-icon-group)' }} />;
}

function TreeNode({ object, depth, query }: { object: THREE.Object3D; depth: number; query: string }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const selectedUuid = useViewerStore((s) => s.selectedUuid);
  const selectNode = useViewerStore((s) => s.selectNode);

  const children = object.children.filter((child) => nodeMatches(child, query));
  const hasChildren = children.length > 0;
  const isSelected = selectedUuid === object.uuid;
  const label = object.name || `(${object.type})`;

  if (!nodeMatches(object, query)) {
    return null;
  }

  return (
    <div>
      <div
        onClick={() => selectNode(isSelected ? null : object.uuid)}
        style={{ paddingLeft: depth * 16 + 4 }}
        className={`flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-0.5 text-xs transition ${
          isSelected ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:bg-white/5 hover:text-ink'
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className={`flex h-4 w-4 items-center justify-center text-ink-faint ${hasChildren ? '' : 'invisible'}`}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        {nodeIcon(object)}
        <span className="truncate">{label}</span>
      </div>

      {expanded && hasChildren && (
        <div>
          {children.map((child) => (
            <TreeNode key={child.uuid} object={child} depth={depth + 1} query={query} />
          ))}
        </div>
      )}
    </div>
  );
}

export function HierarchyPanel() {
  const gltf = useViewerStore((s) => s.gltf);
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();

  const rootChildren = useMemo(() => (gltf ? gltf.scene.children : []), [gltf]);

  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2 rounded-md border border-hairline bg-surface-soft px-2 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search nodes..."
          className="w-full bg-transparent text-xs text-ink outline-none placeholder:text-ink-faint"
        />
      </div>

      <div className="space-y-px">
        {rootChildren.map((child) => (
          <TreeNode key={child.uuid} object={child} depth={0} query={query} />
        ))}
      </div>
    </div>
  );
}
