import { useState } from 'react';
import * as THREE from 'three';
import type { SessionDetail } from '../../api/types';
import { ReplayObjectKind } from '../../viewer/replay/replayFile';
import { materialRows, nodeType } from '../../inspector/inspection';
import { usePlaybackTime } from '../../player/playback';
import { useReplayBinding } from '../../player/binding';
import { unityPath } from '../../player/unityPath';
import { sceneInfo } from '../../stage/sceneAssets';
import { useStage } from '../../stage/store';
import { SegmentTabs } from '../../ui/Tabs';
import { JsonView } from '../JsonView';
import { useStudio } from '../studioStore';
import { EmptyNote } from './parts';

const round = (n: number) => Number(n.toFixed(4));
const vec = (v: THREE.Vector3 | THREE.Euler, degrees = false) => [v.x, v.y, v.z].map((n) => round(degrees ? THREE.MathUtils.radToDeg(n) : n));

function nodeRaw(node: THREE.Object3D, root: THREE.Object3D, id: number | null) {
  const player = useStudio.getState().player;
  const meta = id !== null ? player?.replay.objectsById.get(id) : undefined;
  const mesh = (node as THREE.Mesh).isMesh ? (node as THREE.Mesh) : null;
  const materials = mesh ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
  return {
    objectId: id,
    name: node.name,
    type: nodeType(node),
    unityPath: unityPath(node, root),
    kind: meta ? (Object.entries(ReplayObjectKind).find(([, v]) => v === meta.kind)?.[0] ?? meta.kind) : undefined,
    templateObjectId: meta && meta.kind !== ReplayObjectKind.Scene ? meta.templateObjectId : undefined,
    spawnTimeSeconds: meta && meta.spawnTime >= 0 ? round(meta.spawnTime) : undefined,
    deleteTimeSeconds: meta && meta.deleteTime >= 0 ? round(meta.deleteTime) : undefined,
    visible: node.visible,
    local: { position: vec(node.position), rotationEulerDegrees: vec(new THREE.Euler().setFromQuaternion(node.quaternion), true), scale: vec(node.scale) },
    worldPosition: vec(node.getWorldPosition(new THREE.Vector3())),
    extras: node.userData,
    geometry: mesh ? { vertices: mesh.geometry.attributes.position?.count ?? 0, attributes: Object.keys(mesh.geometry.attributes) } : undefined,
    materials: materials.length ? materials.map((m) => Object.fromEntries(materialRows(m).map((r) => [r.label, r.value]))) : undefined,
  };
}

/** Raw data: the selection as it is now, the session record from the server, or the file's own glTF JSON. */
export function RawWindow({ session }: { session: SessionDetail | null }) {
  const [mode, setMode] = useState<'selection' | 'session' | 'file'>('selection');
  const selected = useStudio((s) => s.selected);
  const selectedId = useStudio((s) => s.selectedId);
  const root = useStudio((s) => s.player?.sceneRoot ?? s.root);
  const playback = useReplayBinding((s) => s.playback);
  const ref = useStage((s) => s.view.scene);
  const info = ref ? sceneInfo(ref) : null;
  // During a replay the selection's values change; refresh a few times a second.
  usePlaybackTimeIf(playback);

  const items = [
    { id: 'selection' as const, label: 'Selection' },
    ...(session ? [{ id: 'session' as const, label: 'Session' }] : []),
    { id: 'file' as const, label: 'glTF file' },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pb-3 pt-4">
        <SegmentTabs value={mode} onChange={setMode} items={items} />
      </div>
      {mode === 'session' && session ? (
        <JsonView value={session} label="Session record from the server" />
      ) : mode === 'file' ? (
        info ? <JsonView value={info.json} label="The glTF JSON in this scene version" /> : <EmptyNote>The scene is still loading.</EmptyNote>
      ) : selected && root ? (
        <JsonView value={nodeRaw(selected, root, selectedId)} label={`${selected.name || nodeType(selected)}${selectedId !== null ? ` #${selectedId}` : ''}${playback ? ', at this moment' : ''}`} />
      ) : (
        <EmptyNote>Select an object in the view or in the Hierarchy to see its raw data.</EmptyNote>
      )}
    </div>
  );
}

function usePlaybackTimeIf(playback: ReturnType<typeof useReplayBinding.getState>['playback']) {
  // Hooks cannot be conditional; a stand-in clock keeps the call order stable.
  usePlaybackTime(playback ?? STILL, 4);
}

const STILL = { time: 0, subscribe: () => () => undefined } as unknown as Parameters<typeof usePlaybackTime>[0];
