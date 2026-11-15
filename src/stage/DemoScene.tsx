import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import type { Line2 } from 'three-stdlib';
import { Ground } from '../viewer/core/Ground';
import { PALETTE } from '../viewer/core/palette';
import { SceneLights, type SceneBounds } from './SceneContent';
import { reducedMotion } from './support';

/**
 * The sign-in screen's stage: a small concrete courtyard built from boxes, with one player capsule
 * walking a loop and leaving an amber trace of where it has been. It is what the product does, shown
 * before there is any data to show. Nothing is downloaded; it is a few dozen boxes.
 *
 * The page's decorative timeline reads `demoClock`, so the playhead under the scene moves with it.
 */
export const demoClock = { time: 42.36, duration: 154.8 };

type Box = [w: number, h: number, d: number, x: number, y: number, z: number];

const CONCRETE: Box[] = [
  // The slab everything stands on.
  [20, 1, 20, 0, 0.5, 0],
  // Back terraces and the tower.
  [8, 3, 6, -6, 2.5, -7],
  [6, 3, 8, 7, 2.5, -6],
  [4, 7.5, 4, -1, 4.75, -7.5],
  [3, 2.2, 3, -1, 9.6, -7.5],
  // Tall back walls, cut-away style.
  [0.5, 7, 9, -9.75, 4.5, 3.5],
  [0.5, 5, 6, -9.75, 3.5, -3],
  [9, 6, 0.5, 4.5, 4, -9.75],
  [0.5, 8, 4, 9.75, 5, -7],
  // Rooms on the right.
  [5, 4, 5, 7, 3, 3.5],
  [0.4, 5.5, 5, 9.8, 3.75, 3.5],
  [5, 2.2, 0.4, 7, 6.1, 1.2],
  // Front parapets, kept low so the courtyard stays visible.
  [7, 1.1, 0.4, -5.5, 1.55, 9.8],
  [0.4, 1.1, 7, 9.8, 1.55, 8],
  // A platform with its stairs.
  [5, 2, 4, -6, 2, 4],
  [1, 0.33, 2, -2.9, 1.17, 4],
  [1, 0.66, 2, -3.4, 1.33, 4],
  [1, 1, 2, -3.0, 1.5, 4],
  // Steps up to the left terrace.
  ...Array.from({ length: 7 }, (_, i): Box => [1.6, (i + 1) * 0.42, 0.9, -3.2, 1 + ((i + 1) * 0.42) / 2, -2.3 - i * 0.6]),
  // Steps up to the right terrace.
  ...Array.from({ length: 7 }, (_, i): Box => [0.9, (i + 1) * 0.42, 1.6, 2.3 + i * 0.6, 1 + ((i + 1) * 0.42) / 2, -1.2]),
  // Odds and ends.
  [1.2, 0.8, 0.7, -8.6, 1.4, 7.6],
  [0.8, 1.6, 0.8, 4.2, 5.8, -8.6],
  [1.4, 0.6, 1.0, 7.2, 5.3, -4],
];

const DARK: Box[] = [
  // Doorways and window recesses.
  [1.4, 2.4, 0.1, -1, 2.2, -5.45],
  [1.2, 1.4, 0.1, -1, 6.4, -5.45],
  [0.1, 2.4, 1.4, 4.45, 2.2, 3.5],
  [1.4, 2.4, 0.1, 7, 2.2, 6.05],
  [0.1, 1.6, 1.2, -9.45, 5.6, 4.2],
  [1.6, 1.2, 0.1, 6, 5.2, -9.45],
  // Floor grates.
  [3, 0.04, 2.2, 1.8, 1.02, 6.2],
  [2.4, 0.04, 2.4, -6.5, 4.02, -6.5],
  [2.4, 0.04, 1.6, 6.5, 4.02, -3],
];

const PANELS: Box[] = [
  [1, 1.4, 0.08, -3.2, 2.4, -3.96],
  [0.08, 1.4, 1, 4.42, 2.6, 5.4],
  [1, 1.4, 0.08, 8.4, 2.5, 6.04],
  [1.1, 1.5, 0.08, -6.8, 2.4, -3.96],
  [0.08, 1.2, 1, -9.46, 3.2, 0.6],
  [1, 1.2, 0.08, 2, 4.2, -9.46],
  [1, 1.4, 0.08, 7.6, 2.4, -1.96],
];

/** The capsule's loop around the courtyard floor. */
const PATH = new THREE.CatmullRomCurve3(
  [
    [1.5, 1, 7.5],
    [5, 1, 7.6],
    [2.5, 1, 2.2],
    [-1.2, 1, 1.4],
    [-1.6, 1, 6.2],
    [-0.4, 1, 8.4],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  true,
  'centripetal',
);
const LAP_SECONDS = 26;
const TRAIL_POINTS = 90;
const TRAIL_SECONDS = 9;

const BOUNDS: SceneBounds = { center: new THREE.Vector3(0, 3, 0), radius: 15, floorY: 0 };

function Boxes({ boxes, material }: { boxes: Box[]; material: THREE.Material }) {
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    boxes.forEach(([w, h, d, x, y, z], i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d))));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [boxes]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <instancedMesh ref={ref} args={[geometry, material, boxes.length]} castShadow receiveShadow />;
}

export function DemoScene() {
  const materials = useMemo(
    () => ({
      concrete: new THREE.MeshStandardMaterial({ color: '#d9d1c3', roughness: 0.92, metalness: 0 }),
      dark: new THREE.MeshStandardMaterial({ color: '#3b3732', roughness: 0.8 }),
      panel: new THREE.MeshStandardMaterial({ color: '#d0653a', roughness: 0.6, emissive: '#5a1d08', emissiveIntensity: 0.25 }),
      player: new THREE.MeshStandardMaterial({ color: '#3d5ee0', roughness: 0.35, metalness: 0.05 }),
    }),
    [],
  );
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  const capsule = useRef<THREE.Mesh>(null);
  const trail = useRef<Line2>(null);
  const calm = reducedMotion();
  const trailPoints = useMemo(() => Array.from({ length: TRAIL_POINTS }, () => new THREE.Vector3(1.5, 1.02, 7.5)), []);
  const colors = useMemo(() => {
    const accent = new THREE.Color(PALETTE.accent);
    const floor = new THREE.Color('#2a2622');
    return Array.from({ length: TRAIL_POINTS }, (_, i) => floor.clone().lerp(accent, (i / (TRAIL_POINTS - 1)) ** 1.6));
  }, []);

  const place = (time: number) => {
    const at = (t: number) => PATH.getPointAt((((t / LAP_SECONDS) % 1) + 1) % 1);
    const here = at(time);
    const ahead = at(time + 0.05);
    capsule.current?.position.set(here.x, 1 + 0.55, here.z);
    capsule.current?.lookAt(ahead.x, 1 + 0.55, ahead.z);
    for (let i = 0; i < TRAIL_POINTS; i++) {
      const p = at(time - TRAIL_SECONDS * (1 - i / (TRAIL_POINTS - 1)));
      trailPoints[i].set(p.x, 1.03, p.z);
    }
    const geometry = trail.current?.geometry as { setPositions?: (a: number[]) => void } | undefined;
    geometry?.setPositions?.(trailPoints.flatMap((p) => [p.x, p.y, p.z]));
  };

  useEffect(() => {
    place(demoClock.time);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, delta) => {
    if (calm || document.hidden) return;
    demoClock.time = (demoClock.time + Math.min(delta, 0.1)) % demoClock.duration;
    place(demoClock.time);
  });

  return (
    <>
      <SceneLights bounds={BOUNDS} />
      <Boxes boxes={CONCRETE} material={materials.concrete} />
      <Boxes boxes={DARK} material={materials.dark} />
      <Boxes boxes={PANELS} material={materials.panel} />
      <mesh ref={capsule} castShadow material={materials.player}>
        <capsuleGeometry args={[0.32, 0.5, 6, 16]} />
      </mesh>
      <Line ref={trail} points={trailPoints} vertexColors={colors} lineWidth={2.2} transparent opacity={0.95} />
      <Ground y={0} fadeDistance={90} cellSize={2} shadows extent={160} />
    </>
  );
}

export const DEMO_POSE = { position: [27, 22, 27] as [number, number, number], target: [0, 2.2, 0] as [number, number, number], fov: 32 };
