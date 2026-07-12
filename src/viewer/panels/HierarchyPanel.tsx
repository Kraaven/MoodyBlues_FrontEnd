import { useMemo, useState } from 'react';
import type * as THREE from 'three';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useViewerStore } from '../viewerStore';

function nodeMatches(object: THREE.Object3D, query: string): boolean {
  if (!query) return true;
  if (object.name.toLowerCase().includes(query)) return true;
  return object.children.some((child) => nodeMatches(child, query));
}

function TreeNode({ object, depth, query }: { object: THREE.Object3D; depth: number; query: string }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const selectedUuid = useViewerStore((s) => s.selectedUuid);
  const selectNode = useViewerStore((s) => s.selectNode);

  const visibleChildren = object.children.filter((child) => nodeMatches(child, query));
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
          isSelected ? 'bg-violet-500/20 text-violet-200' : 'text-zinc-300 hover:bg-white/5'
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className={`flex h-4 w-4 items-center justify-center text-zinc-500 ${hasChildren ? '' : 'invisible'}`}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <span className="truncate">{label}</span>
        <span className="ml-auto shrink-0 text-[10px] text-zinc-600">{object.type}</span>
      </div>

      {expanded && hasChildren && (
        <div>
          {visibleChildren.map((child) => (
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

  const rootChildren = useMemo(() => gltf?.scene.children ?? [], [gltf]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2 py-1.5">
        <Search className="h-3.5 w-3.5 text-zinc-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search nodes..."
          className="w-full bg-transparent text-xs text-white outline-none placeholder:text-zinc-600"
        />
      </div>

      {rootChildren.map((child) => (
        <TreeNode key={child.uuid} object={child} depth={0} query={query} />
      ))}
    </div>
  );
}
