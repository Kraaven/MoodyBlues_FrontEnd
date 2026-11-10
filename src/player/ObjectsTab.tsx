import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import * as THREE from 'three';
import { Box, Boxes, Camera, ChevronDown, ChevronRight, Crosshair, Lightbulb, LocateFixed, Search, Sparkles, X } from 'lucide-react';
import { ReplayObjectKind } from '../viewer/replay/replayFile';
import type { ReplayPlayer } from '../viewer/replay/ReplayPlayer';
import { Button, IconButton } from '../ui/Button';
import { SectionLabel } from '../ui/States';
import { cn } from '../ui/cn';
import { formatPlayhead } from '../lib/format';
import { usePlaybackState, usePlayerUi, type Playback } from './playback';
import { unityPath } from './unityPath';

interface TreeRow {
  id: number;
  name: string;
  depth: number;
  hasChildren: boolean;
  visible: boolean;
  kind: number;
  icon: 'mesh' | 'camera' | 'light' | 'group';
}

/** Every node with an object id under the scene root, as a tree, as it is right now. */
function buildTree(player: ReplayPlayer, collapsed: Set<number>, query: string): TreeRow[] {
  const rows: TreeRow[] = [];
  const needle = query.trim().toLowerCase();

  const iconOf = (node: THREE.Object3D): TreeRow['icon'] => {
    let mesh = false;
    for (const child of [node, ...node.children]) {
      if ((child as THREE.Camera).isCamera) return 'camera';
      if ((child as THREE.Light).isLight) return 'light';
      if ((child as THREE.Mesh).isMesh) mesh = true;
    }
    return mesh ? 'mesh' : 'group';
  };

  /** Tracked descendants of a node, skipping untracked in-between nodes. */
  const trackedChildren = (node: THREE.Object3D): THREE.Object3D[] => {
    const out: THREE.Object3D[] = [];
    for (const child of node.children) {
      if (typeof child.userData?.objectId === 'number') out.push(child);
      else out.push(...trackedChildren(child));
    }
    return out;
  };

  const matches = (node: THREE.Object3D): boolean =>
    node.name.toLowerCase().includes(needle) || trackedChildren(node).some(matches);

  const visit = (node: THREE.Object3D, depth: number, parentVisible: boolean) => {
    const id = node.userData.objectId as number;
    if (needle && !matches(node)) return;
    const children = trackedChildren(node);
    const visible = parentVisible && node.visible;
    rows.push({
      id,
      name: node.name || `Object ${id}`,
      depth,
      hasChildren: children.length > 0,
      visible,
      kind: player.replay.objectsById.get(id)?.kind ?? ReplayObjectKind.Scene,
      icon: iconOf(node),
    });
    if (needle || !collapsed.has(id)) for (const child of children) visit(child, depth + 1, visible);
  };

  for (const node of trackedChildren(player.sceneRoot)) visit(node, 0, true);
  return rows;
}

const ICONS = { mesh: Box, camera: Camera, light: Lightbulb, group: Boxes };

/** The replayed hierarchy and the selected object (DESIGN.md 7.6). */
export function ObjectsTab({ playback }: { playback: Playback }) {
  const { ready } = usePlaybackState(playback);
  const player = playback.player;
  const selectedId = usePlayerUi((s) => s.selectedId);
  const select = usePlayerUi((s) => s.select);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [revision, setRevision] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Spawns appear and disappear with the playhead: rebuild the tree a few times a second.
  useEffect(() => {
    let last = 0;
    return playback.subscribe(() => {
      const now = performance.now();
      if (now - last > 400) {
        last = now;
        setRevision((r) => r + 1);
      }
    });
  }, [playback]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- revision drives the rebuild
  const rows = useMemo(() => (player ? buildTree(player, collapsed, query) : []), [player, collapsed, query, revision, ready]);

  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => 28, overscan: 20 });

  // Bring the selection into view when it changes from the viewport.
  useEffect(() => {
    if (selectedId === null) return;
    const index = rows.findIndex((r) => r.id === selectedId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  if (!player) return <p className="p-4 text-[13px] text-fg-2">The scene is still loading.</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-rule p-3">
        <label className="flex h-8 items-center gap-2 rounded-[var(--radius-control)] border border-rule-strong bg-ink-2 px-2.5 focus-within:border-blue">
          <Search className="h-3.5 w-3.5 shrink-0 text-fg-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search objects"
            className="w-full bg-transparent text-[13px] text-fg outline-none placeholder:text-fg-3"
          />
        </label>
      </div>

      <div ref={scrollRef} role="tree" aria-label="Objects" className="min-h-0 flex-1 overflow-y-auto py-1">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            const Icon = ICONS[row.icon];
            const isCollapsed = collapsed.has(row.id);
            return (
              <div
                key={row.id}
                role="treeitem"
                aria-selected={row.id === selectedId}
                aria-expanded={row.hasChildren ? !isCollapsed : undefined}
                onClick={() => select(row.id === selectedId ? null : row.id)}
                className={cn(
                  'absolute left-0 right-0 flex h-7 cursor-pointer items-center gap-1.5 pr-3 text-[13px] transition-colors duration-[120ms]',
                  row.id === selectedId ? 'bg-blue/15 text-fg shadow-[inset_2px_0_0_var(--color-blue)]' : 'text-fg-2 hover:bg-ink-2 hover:text-fg',
                  !row.visible && 'opacity-45',
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
                      if (next.has(row.id)) next.delete(row.id);
                      else next.add(row.id);
                      return next;
                    });
                  }}
                  className={cn('flex h-4 w-4 items-center justify-center text-fg-3', !row.hasChildren && 'invisible')}
                >
                  {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {row.kind === ReplayObjectKind.Scene ? <Icon className="h-3.5 w-3.5 shrink-0 text-fg-3" /> : <Sparkles className="h-3.5 w-3.5 shrink-0 text-blue-bright" />}
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                <span className="tabular font-mono text-[11px] text-fg-3">#{row.id}</span>
              </div>
            );
          })}
        </div>
      </div>

      {selectedId !== null && <SelectedObject player={player} objectId={selectedId} playback={playback} />}
    </div>
  );
}

function SelectedObject({ player, objectId, playback }: { player: ReplayPlayer; objectId: number; playback: Playback }) {
  const follow = usePlayerUi((s) => s.follow);
  const setFollow = usePlayerUi((s) => s.setFollow);
  const select = usePlayerUi((s) => s.select);
  const frameSelected = usePlayerUi((s) => s.frameSelected);
  const obj = player.replay.objectsById.get(objectId);
  const node = player.getObject(objectId);
  const path = node ? unityPath(node, player.sceneRoot) : null;
  const localRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);

  // Live transform, written straight to the DOM every frame (DESIGN.md 15).
  useEffect(() => {
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();
    const fmt = (v: THREE.Vector3 | THREE.Euler, deg = false) =>
      [v.x, v.y, v.z].map((n) => (deg ? THREE.MathUtils.radToDeg(n) : n).toFixed(deg ? 1 : 3).padStart(8)).join(' ');
    return playback.subscribe(() => {
      const node = player.getObject(objectId);
      if (!node) {
        if (localRef.current) localRef.current.textContent = 'Not alive at this time';
        if (worldRef.current) worldRef.current.textContent = '';
        return;
      }
      if (localRef.current) {
        localRef.current.textContent = `pos ${fmt(node.position)}\nrot ${fmt(e.setFromQuaternion(node.quaternion), true)}\nscl ${fmt(node.scale)}`;
      }
      node.matrixWorld.decompose(p, q, s);
      if (worldRef.current) worldRef.current.textContent = `pos ${fmt(p)}\nscl ${fmt(s)}`;
    });
  }, [player, objectId, playback]);

  const kind =
    obj?.kind === ReplayObjectKind.Spawned
      ? `Spawned from ${player.nameOf(obj.templateObjectId)}`
      : obj?.kind === ReplayObjectKind.SpawnedPart
        ? 'Part of a spawned object'
        : 'Scene object';

  return (
    <div className="shrink-0 space-y-3 border-t border-rule bg-ink-1 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-fg">{player.nameOf(objectId)}</p>
          <p className="text-[12px] text-fg-3">
            <span className="tabular font-mono">#{objectId}</span> · {kind}
          </p>
          {path && (
            <p className="mt-0.5 truncate font-mono text-[11px] text-fg-3" title={`${path} (press C to copy)`}>
              {path}
            </p>
          )}
        </div>
        <IconButton label="Frame selection" size="sm" onClick={frameSelected}>
          <LocateFixed className="h-4 w-4" />
        </IconButton>
        <IconButton label={follow ? 'Stop following' : 'Follow'} shortcut="F" size="sm" active={follow} onClick={() => setFollow(!follow)}>
          <Crosshair className="h-4 w-4" />
        </IconButton>
        <IconButton label="Clear selection" shortcut="Esc" size="sm" onClick={() => select(null)}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <div className="space-y-1">
          <SectionLabel>Local</SectionLabel>
          <div ref={localRef} className="tabular overflow-x-auto whitespace-pre font-mono text-[11px] leading-4 text-fg-2" />
        </div>
        <div className="space-y-1">
          <SectionLabel>World</SectionLabel>
          <div ref={worldRef} className="tabular whitespace-pre font-mono text-[11px] leading-4 text-fg-2" />
        </div>
      </div>
      {obj && (obj.spawnTime >= 0 || obj.deleteTime >= 0) && (
        <div className="flex flex-wrap gap-2">
          {obj.spawnTime >= 0 && (
            <Button size="sm" variant="secondary" onClick={() => playback.seek(obj.spawnTime)}>
              Jump to spawn · {formatPlayhead(obj.spawnTime)}
            </Button>
          )}
          {obj.deleteTime >= 0 && (
            <Button size="sm" variant="secondary" onClick={() => playback.seek(Math.max(0, obj.deleteTime - 0.05))}>
              Jump to delete · {formatPlayhead(obj.deleteTime)}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
