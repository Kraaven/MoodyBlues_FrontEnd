import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Copy, Crosshair, LocateFixed, MousePointerClick } from 'lucide-react';
import { ReplayObjectKind } from '../../viewer/replay/replayFile';
import { useReplayBinding } from '../../player/binding';
import { unityPath } from '../../player/unityPath';
import { nodeType, triangleCount } from '../../inspector/inspection';
import { Button, IconButton } from '../../ui/Button';
import { cn } from '../../ui/cn';
import { formatCount, formatPlayhead } from '../../lib/format';
import { useStudio } from '../studioStore';
import { kindOf, NodeIcon, ObjectHeading, Row, Rule, SectionTitle, WindowBody } from './parts';

const AXES = [
  { label: 'X', className: 'text-axis-x' },
  { label: 'Y', className: 'text-axis-y' },
  { label: 'Z', className: 'text-axis-z' },
];

/** The transform table, written straight to the DOM every frame during a replay (no React per frame). */
function TransformTable({ node, live }: { node: THREE.Object3D; live: boolean }) {
  const playback = useReplayBinding((s) => s.playback);
  const cells = useRef<(HTMLSpanElement | null)[]>([]);
  const [space, setSpace] = useState<'local' | 'world'>('local');

  useEffect(() => {
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();
    const write = () => {
      const studio = useStudio.getState();
      const n = studio.selected ?? node;
      let pos: THREE.Vector3, rot: THREE.Euler, scl: THREE.Vector3;
      if (space === 'world') {
        n.updateWorldMatrix(true, false);
        n.matrixWorld.decompose(p, q, s);
        pos = p;
        rot = e.setFromQuaternion(q);
        scl = s;
      } else {
        pos = n.position;
        rot = e.setFromQuaternion(n.quaternion);
        scl = n.scale;
      }
      const values = [pos.x, pos.y, pos.z, ...[rot.x, rot.y, rot.z].map((r) => THREE.MathUtils.radToDeg(r)), scl.x, scl.y, scl.z];
      values.forEach((v, i) => {
        const cell = cells.current[i];
        if (cell) cell.textContent = (Math.abs(v) < 0.0005 ? 0 : v).toFixed(i >= 3 && i < 6 ? 1 : 2);
      });
    };
    write();
    if (live && playback) return playback.subscribe(write);
  }, [node, live, playback, space]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <SectionTitle className="mb-0">Transform</SectionTitle>
        <div role="tablist" className="flex gap-3 font-mono text-[11px] uppercase tracking-[0.06em]">
          {(['local', 'world'] as const).map((s) => (
            <button key={s} type="button" role="tab" aria-selected={space === s} onClick={() => setSpace(s)} className={space === s ? 'text-accent' : 'text-fg-3 hover:text-fg-2'}>
              {s}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-[96px_1fr_1fr_1fr] gap-y-4 font-mono text-[14px]">
        <span />
        {AXES.map((a) => (
          <span key={a.label} className={cn('text-[12px]', a.className)}>
            {a.label}
          </span>
        ))}
        {['Position', 'Rotation', 'Scale'].map((label, row) => (
          <div key={label} className="contents">
            <span className="font-sans text-[14px] text-fg-2">{label}</span>
            {[0, 1, 2].map((c) => (
              <span key={c} ref={(el) => void (cells.current[row * 3 + c] = el)} className="tabular truncate text-fg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** What is selected: its name, its ObjectID, its live transform and where it sits in Unity's hierarchy. */
export function InspectorWindow() {
  const selected = useStudio((s) => s.selected);
  const selectedId = useStudio((s) => s.selectedId);
  const player = useStudio((s) => s.player);
  const root = useStudio((s) => s.root);
  const follow = useStudio((s) => s.follow);
  const playback = useReplayBinding((s) => s.playback);
  const [visible, setVisible] = useState(true);

  // Active or not, at this moment.
  useEffect(() => {
    if (!selected) return;
    const check = () => {
      let v = true;
      for (let n: THREE.Object3D | null = selected; n; n = n.parent) if (!n.visible) v = false;
      setVisible(v);
    };
    check();
    if (player && playback) return playback.subscribe(check);
  }, [selected, player, playback]);

  if (!selected && selectedId === null) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <MousePointerClick className="h-6 w-6 text-fg-3" strokeWidth={1.5} />
        <p className="text-[14px] text-fg-2">Click an object in the view, or pick one in the Hierarchy.</p>
      </div>
    );
  }

  if (!selected) {
    const meta = selectedId !== null ? player?.replay.objectsById.get(selectedId) : undefined;
    return (
      <WindowBody>
        <ObjectHeading icon={<NodeIcon kind="spawn" className="h-9 w-9" />} name={player && selectedId !== null ? player.nameOf(selectedId) : 'Object'} kind={`Not alive now / #${selectedId}`} />
        <p className="mt-6 text-[14px] text-fg-2">This object does not exist at this moment of the recording.</p>
        {meta && meta.spawnTime >= 0 && playback && (
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => playback.seek(meta.spawnTime)}>
            Jump to spawn · {formatPlayhead(meta.spawnTime)}
          </Button>
        )}
      </WindowBody>
    );
  }

  const meta = selectedId !== null ? player?.replay.objectsById.get(selectedId) : undefined;
  const path = root ? unityPath(selected, player?.sceneRoot ?? root) : '';
  const mesh = (selected as THREE.Mesh).isMesh ? (selected as THREE.Mesh) : (selected.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh | undefined);
  const kind =
    meta?.kind === ReplayObjectKind.Spawned
      ? `Spawned from ${player?.nameOf(meta.templateObjectId)}`
      : meta?.kind === ReplayObjectKind.SpawnedPart
        ? 'Part of a spawned object'
        : player
          ? 'Recorded scene object'
          : nodeType(selected);
  const inactiveAtStart = selected.userData?.isHidden === true;

  return (
    <WindowBody className="space-y-0">
      <ObjectHeading
        icon={<NodeIcon kind={meta && meta.kind !== ReplayObjectKind.Scene ? 'spawn' : kindOf(selected)} className="h-9 w-9" />}
        name={selected.name || (selectedId !== null && player ? player.nameOf(selectedId) : '(unnamed)')}
        kind={
          <>
            {player ? 'GameObject' : 'Node'} <span className="mx-1.5 text-fg-3/60">/</span> {selectedId !== null ? `#${selectedId}` : 'not tracked'}
          </>
        }
      />
      <div className="mt-6 flex items-center justify-between">
        <span className="rounded-[6px] bg-ink-4/70 px-3.5 py-1.5 text-[13px] text-fg-2">Read only</span>
        <span className={cn('text-[14px]', visible ? 'text-ok' : 'text-fg-3')}>{visible ? 'Active' : player ? 'Hidden now' : 'Inactive'}</span>
      </div>
      <Rule />
      <TransformTable node={selected} live={Boolean(player)} />
      <Rule />
      <dl>
        <Row label="Kind">{kind}</Row>
        {inactiveAtStart && <Row label="At start">inactive</Row>}
        {mesh && <Row label="Vertices">{formatCount(mesh.geometry.attributes.position?.count ?? 0)}</Row>}
        {mesh && <Row label="Triangles">{formatCount(triangleCount(mesh.geometry))}</Row>}
        {mesh && (
          <Row label="Materials" title={(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m.name || m.type).join(', ')}>
            {(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m.name || m.type).join(', ')}
          </Row>
        )}
        {meta && meta.spawnTime >= 0 && <Row label="Spawned">{formatPlayhead(meta.spawnTime)}</Row>}
        {meta && meta.deleteTime >= 0 && <Row label="Deleted">{formatPlayhead(meta.deleteTime)}</Row>}
      </dl>
      {path && (
        <div className="mt-4">
          <SectionTitle>Unity path</SectionTitle>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(path).catch(() => undefined)}
            title="Copy the path"
            className="group flex w-full items-start gap-2 rounded-[6px] bg-ink-0/50 px-3 py-2.5 text-left font-mono text-[12px] leading-5 text-fg-2 hover:text-fg"
          >
            <span className="min-w-0 flex-1 break-all">{path}</span>
            <Copy className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-3 group-hover:text-accent" />
          </button>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <IconButton label="Frame selection" shortcut="Shift+F" size="sm" onClick={() => useStudio.getState().frameSelected()}>
          <LocateFixed className="h-4 w-4" />
        </IconButton>
        {player && (
          <Button variant={follow ? 'primary' : 'secondary'} size="sm" onClick={() => useStudio.getState().setFollow(!follow)}>
            <Crosshair className="h-4 w-4" />
            {follow ? 'Following' : 'Follow'}
          </Button>
        )}
        {meta && meta.spawnTime >= 0 && playback && (
          <Button variant="ghost" size="sm" onClick={() => playback.seek(meta.spawnTime)}>
            Spawn {formatPlayhead(meta.spawnTime, 0)}
          </Button>
        )}
        {meta && meta.deleteTime >= 0 && playback && (
          <Button variant="ghost" size="sm" onClick={() => playback.seek(Math.max(0, meta.deleteTime - 0.05))}>
            Delete {formatPlayhead(meta.deleteTime, 0)}
          </Button>
        )}
      </div>
    </WindowBody>
  );
}
