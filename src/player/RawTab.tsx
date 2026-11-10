import * as THREE from 'three';
import { useState } from 'react';
import type { SessionDetail } from '../api/types';
import { JsonView } from '../panels/JsonView';
import { ReplayObjectKind } from '../viewer/replay/replayFile';
import type { ReplayPlayer } from '../viewer/replay/ReplayPlayer';
import { SegmentTabs } from '../ui/Tabs';
import { usePlaybackTime, usePlayerUi, type Playback } from './playback';
import { unityPath } from './unityPath';

const round = (n: number) => Number(n.toFixed(4));
const vec = (v: THREE.Vector3 | THREE.Euler, degrees = false) => [v.x, v.y, v.z].map((n) => round(degrees ? THREE.MathUtils.radToDeg(n) : n));

/** Everything the viewer knows about one object at the current moment, as it is. */
function objectRaw(player: ReplayPlayer, id: number, node: THREE.Object3D) {
  const meta = player.replay.objectsById.get(id);
  const world = new THREE.Vector3();
  node.getWorldPosition(world);
  return {
    objectId: id,
    name: node.name,
    unityPath: unityPath(node, player.sceneRoot),
    kind: meta ? (Object.entries(ReplayObjectKind).find(([, v]) => v === meta.kind)?.[0] ?? meta.kind) : 'Scene',
    templateObjectId: meta?.kind === ReplayObjectKind.Scene ? undefined : meta?.templateObjectId,
    spawnTimeSeconds: meta && meta.spawnTime >= 0 ? round(meta.spawnTime) : null,
    deleteTimeSeconds: meta && meta.deleteTime >= 0 ? round(meta.deleteTime) : null,
    visibleNow: node.visible,
    local: { position: vec(node.position), rotationEulerDegrees: vec(new THREE.Euler().setFromQuaternion(node.quaternion), true), scale: vec(node.scale) },
    worldPosition: vec(world),
    extras: node.userData,
  };
}

/** Raw data (DESIGN.md 9.5): the selected object, or the session record the backend holds. */
export function RawTab({ session, playback }: { session: SessionDetail; playback: Playback }) {
  const [mode, setMode] = useState<'object' | 'session'>('object');
  const selectedId = usePlayerUi((s) => s.selectedId);
  usePlaybackTime(playback, 4);

  const player = playback.player;
  const node = selectedId !== null ? player?.getObject(selectedId) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-rule p-2">
        <SegmentTabs
          value={mode}
          onChange={setMode}
          items={[
            { id: 'object', label: 'Object' },
            { id: 'session', label: 'Session' },
          ]}
        />
      </div>
      {mode === 'session' ? (
        <JsonView value={session} label="Session record from the server" />
      ) : player && selectedId !== null && node ? (
        <JsonView value={objectRaw(player, selectedId, node)} label={`${node.name || 'Object'} #${selectedId}, at this moment`} />
      ) : (
        <p className="p-4 text-[13px] text-fg-2">
          {selectedId !== null ? 'This object does not exist at this moment.' : 'Select an object in the view or in Objects to see its raw data.'}
        </p>
      )}
    </div>
  );
}
