import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Box, Boxes, Camera, ChevronDown, ChevronRight, Lightbulb, MousePointerClick, Search } from 'lucide-react';
import { cn } from '../../ui/cn';
import { SectionLabel } from '../../ui/States';
import { formatCount } from '../../lib/format';
import { nodeType, triangleCount } from '../inspection';
import { useInspector } from '../inspectorStore';
import { EmptyNote, Rows } from './shared';

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

/** The scene's nodes as a searchable tree, with what the selected one holds below it. */
export function HierarchyPanel() {
  const root = useInspector((s) => s.root);
  const selected = useInspector((s) => s.selected);
  const select = useInspector((s) => s.select);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const out: Row[] = [];
    if (!root) return out;
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

  // Selecting in the view reveals the node here.
  useEffect(() => {
    if (!selected || !root) return;
    const index = rows.findIndex((r) => r.node === selected);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  if (!root) return <EmptyNote>The scene is still loading.</EmptyNote>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-rule p-3">
        <label className="flex h-8 items-center gap-2 rounded-[var(--radius-control)] border border-rule-strong bg-ink-2 px-2.5 focus-within:border-blue">
          <Search className="h-3.5 w-3.5 shrink-0 text-fg-3" />
          <input
            type="search"
            aria-label="Search nodes"
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
            const label = row.node.name || `(${nodeType(row.node)})`;
            return (
              <div
                key={row.node.uuid}
                role="treeitem"
                tabIndex={0}
                aria-selected={row.node === selected}
                aria-label={label}
                onClick={() => select(row.node === selected ? null : row.node)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    select(row.node === selected ? null : row.node);
                  }
                }}
                className={cn(
                  'absolute left-0 right-0 flex h-7 cursor-pointer items-center gap-1.5 pr-3 text-[13px]',
                  row.node === selected ? 'bg-now/10 text-fg shadow-[inset_2px_0_0_var(--color-now)]' : 'text-fg-2 hover:bg-ink-2 hover:text-fg',
                  row.dim && 'opacity-60',
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
                <span className="min-w-0 flex-1 truncate">{label}</span>
                {typeof id === 'number' && <span className="tabular font-mono text-[11px] text-fg-3">#{id}</span>}
              </div>
            );
          })}
        </div>
      </div>
      {selected ? (
        <NodeDetails node={selected} />
      ) : (
        <div className="flex shrink-0 items-center gap-2 border-t border-rule p-4 text-[13px] text-fg-3">
          <MousePointerClick className="h-4 w-4" />
          Click an object in the view or the list to inspect it.
        </div>
      )}
    </div>
  );
}

function NodeDetails({ node }: { node: THREE.Object3D }) {
  const v = (x: THREE.Vector3) => `${x.x.toFixed(3)}, ${x.y.toFixed(3)}, ${x.z.toFixed(3)}`;
  const e = new THREE.Euler().setFromQuaternion(node.quaternion);
  const deg = `${[e.x, e.y, e.z].map((r) => THREE.MathUtils.radToDeg(r).toFixed(1)).join('°, ')}°`;
  const world = node.getWorldPosition(new THREE.Vector3());
  const mesh = (node as THREE.Mesh).isMesh ? (node as THREE.Mesh) : null;
  const extras = Object.entries(node.userData ?? {}).filter(([k]) => k !== 'objectId' && k !== 'isHidden');

  return (
    <div className="max-h-[45%] shrink-0 space-y-4 overflow-y-auto border-t border-rule p-4" data-testid="node-details">
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
