import { useState } from 'react';
import * as THREE from 'three';
import { JsonView } from '../../panels/JsonView';
import { sceneInfo } from '../../stage/sceneAssets';
import { useStage } from '../../stage/store';
import { SegmentTabs } from '../../ui/Tabs';
import { materialRows, nodeType } from '../inspection';
import { useInspector } from '../inspectorStore';
import { EmptyNote } from './shared';

const round = (n: number) => Number(n.toFixed(4));
const vec = (v: THREE.Vector3) => [v.x, v.y, v.z].map(round);

function nodeRaw(node: THREE.Object3D) {
  const mesh = (node as THREE.Mesh).isMesh ? (node as THREE.Mesh) : null;
  const materials = mesh ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
  return {
    name: node.name,
    type: nodeType(node),
    visible: node.visible,
    local: {
      position: vec(node.position),
      rotationEulerDegrees: [node.rotation.x, node.rotation.y, node.rotation.z].map((r) => round(THREE.MathUtils.radToDeg(r))),
      scale: vec(node.scale),
    },
    worldPosition: vec(node.getWorldPosition(new THREE.Vector3())),
    extras: node.userData,
    geometry: mesh ? { vertices: mesh.geometry.attributes.position?.count ?? 0, attributes: Object.keys(mesh.geometry.attributes) } : undefined,
    materials: materials.map((m) => Object.fromEntries(materialRows(m).map((r) => [r.label, r.value]))),
  };
}

/** Raw data (DESIGN.md 9.5): the selected node as read, or the file's own glTF JSON. */
export function RawPanel() {
  const [mode, setMode] = useState<'node' | 'file'>('node');
  const selected = useInspector((s) => s.selected);
  const ref = useStage((s) => s.view.scene);
  const info = ref ? sceneInfo(ref) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-rule p-2">
        <SegmentTabs
          value={mode}
          onChange={setMode}
          items={[
            { id: 'node', label: 'Selection' },
            { id: 'file', label: 'glTF file' },
          ]}
        />
      </div>
      {mode === 'file' ? (
        info ? <JsonView value={info.json} label="The glTF JSON in this scene version" /> : <EmptyNote>The scene is still loading.</EmptyNote>
      ) : selected ? (
        <JsonView value={nodeRaw(selected)} label={selected.name || nodeType(selected)} />
      ) : (
        <EmptyNote>Select an object in the view or in Hierarchy to see its raw data.</EmptyNote>
      )}
    </div>
  );
}
