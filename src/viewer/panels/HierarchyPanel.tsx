import { useMemo, useState } from 'react';
import type * as THREE from 'three';
import { ChevronDown, ChevronRight, Search, Box, Bone, Camera, Lightbulb, Layers, Folder } from 'lucide-react';
import { useViewerStore } from '../viewerStore';
import { Toggle } from '../../components/ui/Toggle';

function nodeMatches(object: THREE.Object3D, query: string): boolean {
  if (!query) return true;
  if (object.name.toLowerCase().includes(query)) return true;
  return object.children.some((child) => nodeMatches(child, query));
}

function isCollapsible(node: THREE.Object3D): boolean {
  const n = node as THREE.Object3D & { isMesh?: boolean; isBone?: boolean; isLight?: boolean; isCamera?: boolean };
  const hasExtras = node.userData && Object.keys(node.userData).length > 0;
  return !n.isMesh && !n.isBone && !n.isLight && !n.isCamera && !hasExtras && node.children.length === 1;
}

function getEffectiveChildren(node: THREE.Object3D, simplify: boolean): THREE.Object3D[] {
  if (!simplify) return node.children;
  const result: THREE.Object3D[] = [];
  for (const child of node.children) {
    if (isCollapsible(child)) {
      result.push(...getEffectiveChildren(child, simplify));
    } else {
      result.push(child);
    }
  }
  return result;
}

function nodeIcon(object: THREE.Object3D) {
  const cls = 'h-3.5 w-3.5 shrink-0';
  if ((object as THREE.SkinnedMesh).isSkinnedMesh) return <Bone className={cls} />;
  if ((object as THREE.Mesh).isMesh) {
    const mesh = object as THREE.Mesh;
    if ((mesh as any).isInstancedMesh) return <Layers className={cls} />;
    return <Box className={cls} />;
  }
  if ((object as THREE.Bone).isBone) return <Bone className={cls} />;
  if ((object as THREE.Camera).isCamera) return <Camera className={cls} />;
  if ((object as THREE.Light).isLight) return <Lightbulb className={cls} />;
  if (object.type === 'Group' || object.children.length > 0) return <Folder className={cls} />;
  return <Folder className={cls} />;
}

function TreeNode({ object, depth, query, simplify }: { object: THREE.Object3D; depth: number; query: string; simplify: boolean }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const selectedUuid = useViewerStore((s) => s.selectedUuid);
  const selectNode = useViewerStore((s) => s.selectNode);

  const effectiveChildren = getEffectiveChildren(object, simplify);
  const visibleChildren = effectiveChildren.filter((child) => nodeMatches(child, query));
  const hasChildren = visibleChildren.length > 0;
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
        className={`flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs transition ${
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
        <span className="text-ink-faint">{nodeIcon(object)}</span>
        <span className="truncate">{label}</span>
      </div>

      {expanded && hasChildren && (
        <div>
          {visibleChildren.map((child) => (
            <TreeNode key={child.uuid} object={child} depth={depth + 1} query={query} simplify={simplify} />
          ))}
        </div>
      )}
    </div>
  );
}

export function HierarchyPanel() {
  const gltf = useViewerStore((s) => s.gltf);
  const simplify = useViewerStore((s) => s.simplifyHierarchy);
  const toggleSimplify = useViewerStore((s) => s.toggleSimplifyHierarchy);
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();

  const rootChildren = useMemo(() => (gltf ? getEffectiveChildren(gltf.scene, simplify) : []), [gltf, simplify]);

  return (
    <div>
      <div className="mb-3">
        <Toggle
          label="Simplified hierarchy"
          description="Collapse empty transform wrappers"
          checked={simplify}
          onChange={toggleSimplify}
        />
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-lg border border-hairline bg-canvas-raised px-2 py-1.5">
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
          <TreeNode key={child.uuid} object={child} depth={0} query={query} simplify={simplify} />
        ))}
      </div>
    </div>
  );
}
