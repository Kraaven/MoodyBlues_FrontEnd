import { useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { ReplayObjectKind } from '../../viewer/replay/replayFile';
import type { ReplayPlayer } from '../../viewer/replay/ReplayPlayer';
import { useReplayBinding } from '../../player/binding';
import { cn } from '../../ui/cn';
import { formatCount } from '../../lib/format';
import { useStudio } from '../studioStore';
import { EmptyNote, kindOf, NodeIcon, SearchField, WindowFooter, type NodeKind } from './parts';

interface TreeRow {
  key: string;
  node: THREE.Object3D;
  id: number | null;
  name: string;
  depth: number;
  hasChildren: boolean;
  visible: boolean;
  kind: NodeKind;
}

/** Every node under the scene root, as a tree. */
function sceneRows(root: THREE.Object3D, collapsed: Set<string>, needle: string): TreeRow[] {
  const rows: TreeRow[] = [];
  const matches = (n: THREE.Object3D): boolean => n.name.toLowerCase().includes(needle) || n.children.some(matches);
  const visit = (n: THREE.Object3D, depth: number, parentVisible: boolean) => {
    if (needle && !matches(n)) return;
    const visible = parentVisible && n.visible;
    const id = typeof n.userData?.objectId === 'number' ? (n.userData.objectId as number) : null;
    rows.push({ key: n.uuid, node: n, id, name: n.name || '(unnamed)', depth, hasChildren: n.children.length > 0, visible, kind: kindOf(n) });
    if (needle || !collapsed.has(n.uuid)) for (const c of n.children) visit(c, depth + 1, visible);
  };
  for (const c of root.children) visit(c, 0, true);
  return rows;
}

/** The recorded objects of a replay, as a tree, as they are at this moment (spawns come and go). */
function replayRows(player: ReplayPlayer, collapsed: Set<string>, needle: string): TreeRow[] {
  const rows: TreeRow[] = [];
  const tracked = (node: THREE.Object3D): THREE.Object3D[] => {
    const out: THREE.Object3D[] = [];
    for (const child of node.children) {
      if (typeof child.userData?.objectId === 'number') out.push(child);
      else out.push(...tracked(child));
    }
    return out;
  };
  const matches = (n: THREE.Object3D): boolean => n.name.toLowerCase().includes(needle) || tracked(n).some(matches);
  const visit = (node: THREE.Object3D, depth: number, parentVisible: boolean) => {
    const id = player.objectIdOf(node) ?? (node.userData.objectId as number);
    if (needle && !matches(node)) return;
    const children = tracked(node);
    const visible = parentVisible && node.visible;
    const spawned = player.replay.objectsById.get(id)?.kind !== undefined && player.replay.objectsById.get(id)?.kind !== ReplayObjectKind.Scene;
    const key = `${id}:${node.uuid}`;
    rows.push({ key, node, id, name: node.name || player.nameOf(id), depth, hasChildren: children.length > 0, visible, kind: spawned ? 'spawn' : kindOf(node) });
    if (needle || !collapsed.has(key)) for (const c of children) visit(c, depth + 1, visible);
  };
  for (const node of tracked(player.sceneRoot)) visit(node, 0, true);
  return rows;
}

/** The scene's hierarchy, searchable; during a replay, the recorded objects as they are right now. */
export function HierarchyWindow() {
  const root = useStudio((s) => s.root);
  const player = useStudio((s) => s.player);
  const selected = useStudio((s) => s.selected);
  const playback = useReplayBinding((s) => s.playback);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [revision, setRevision] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Spawns appear and disappear with the playhead: rebuild a few times a second while it plays.
  useEffect(() => {
    if (!player || !playback) return;
    let last = 0;
    return playback.subscribe(() => {
      const now = performance.now();
      if (now - last > 400) {
        last = now;
        setRevision((r) => r + 1);
      }
    });
  }, [player, playback]);

  const needle = query.trim().toLowerCase();
  const rows = useMemo(
    () => (player ? replayRows(player, collapsed, needle) : root ? sceneRows(root, collapsed, needle) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision drives the live rebuild
    [player, root, collapsed, needle, revision],
  );
  const total = useMemo(() => {
    let n = 0;
    root?.traverse((x) => {
      if (x !== root && (player ? typeof x.userData?.objectId === 'number' : true)) n++;
    });
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, player, revision]);

  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => 40, overscan: 16 });

  // Selecting in the view reveals the node here.
  useEffect(() => {
    if (!selected) return;
    const index = rows.findIndex((r) => r.node === selected);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  if (!root) return <EmptyNote>The scene is still loading.</EmptyNote>;

  const choose = (row: TreeRow) => {
    const studio = useStudio.getState();
    if (row.node === selected) studio.select(null);
    else if (player && row.id !== null) studio.selectId(row.id);
    else studio.select(row.node);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pb-3 pt-5">
        <SearchField value={query} onChange={setQuery} placeholder="Find an object" />
      </div>
      <div ref={scrollRef} role="tree" aria-label="Hierarchy" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {rows.length === 0 && <p className="px-3 py-4 text-[14px] text-fg-3">Nothing matches “{query}”.</p>}
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            const isCollapsed = collapsed.has(row.key);
            const active = row.node === selected;
            return (
              <div
                key={row.key}
                role="treeitem"
                tabIndex={0}
                aria-selected={active}
                aria-expanded={row.hasChildren ? !isCollapsed : undefined}
                onClick={() => choose(row)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    choose(row);
                  }
                }}
                className={cn(
                  'absolute left-0 right-0 flex h-10 cursor-pointer items-center gap-2 rounded-[8px] pr-3 text-[15px] transition-colors duration-[120ms]',
                  active ? 'bg-accent/20 text-accent' : 'text-fg hover:bg-ink-3',
                  !row.visible && !active && 'text-fg-3',
                )}
                style={{ transform: `translateY(${item.start}px)`, paddingLeft: 8 + row.depth * 22 }}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(row.key)) next.delete(row.key);
                      else next.add(row.key);
                      return next;
                    });
                  }}
                  className={cn('flex h-5 w-5 shrink-0 items-center justify-center text-fg-3 hover:text-fg', !row.hasChildren && 'invisible')}
                >
                  {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <NodeIcon kind={row.kind} className={active ? 'text-accent' : row.kind === 'spawn' ? 'text-accent/80' : 'text-fg-3'} />
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                {row.id !== null && <span className="tabular font-mono text-[11px] text-fg-3">#{row.id}</span>}
              </div>
            );
          })}
        </div>
      </div>
      <WindowFooter>
        <span>
          {formatCount(total)} {player ? 'recorded objects' : 'objects'} · {selected ? 'Selected' : 'Select to inspect'}
        </span>
      </WindowFooter>
    </div>
  );
}
