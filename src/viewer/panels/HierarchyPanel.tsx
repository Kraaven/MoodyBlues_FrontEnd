import { useMemo, useState } from 'react';
import type * as THREE from 'three';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useViewerStore } from '../viewerStore';
import { Toggle } from '../../components/ui/Toggle';

function nodeMatches(object: THREE.Object3D, query: string): boolean {
  if (!query) return true;
  if (object.name.toLowerCase().includes(query)) return true;
  return object.children.some((child) => nodeMatches(child, query));
}

/** A pure pass-through transform wrapper -- no mesh/light/camera/bone content, no extras, exactly one child. */
function isCollapsible(node: THREE.Object3D): boolean {
  const n = node as THREE.Object3D & { isMesh?: boolean; isBone?: boolean; isLight?: boolean; isCamera?: boolean };
  const hasExtras = node.userData && Object.keys(node.userData).length > 0;
  return !n.isMesh && !n.isBone && !n.isLight && !n.isCamera && !hasExtras && node.children.length === 1;
}

/** Flattens chains of collapsible empty wrapper nodes so the simplified tree only shows meaningful structure. */
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
        style={{ paddingLeft: depth * 14 }}
        className={`flex cursor-pointer items-center gap-1 rounded px-1 py-1 text-xs transition ${
          isSelected ? 'bg-accent-soft text-accent-ink' : 'text-ink-muted hover:bg-white/5'
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
        <span className="truncate">{label}</span>
        <span className="ml-auto shrink-0 text-[10px] text-ink-faint">{object.type}</span>
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
        <Search className="h-3.5 w-3.5 text-ink-faint" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search nodes..."
          className="w-full bg-transparent text-xs text-ink outline-none placeholder:text-ink-faint"
        />
      </div>

      {rootChildren.map((child) => (
        <TreeNode key={child.uuid} object={child} depth={0} query={query} simplify={simplify} />
      ))}
    </div>
  );
}
