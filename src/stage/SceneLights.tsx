import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { findSunLight } from '../viewer/core/lightRules';
import { shadowMapSize, type QualityTier } from '../viewer/core/look';
import { useRedraw } from './redraw';
import { useQualityTier, useEffectiveLook } from './lookState';
import type { SceneBounds } from './SceneContent';
import type { GameScene } from './sceneAssets';
import { useStage } from './store';

/** The studio key light's direction (towards the light). */
const STUDIO_DIRECTION = new THREE.Vector3(-0.9, 1.6, 0.7).normalize();
/** Zoom steps of the shadow region: it changes in steps, so the map is not redrawn on every wheel notch. */
const SHADOW_STEP = 1.25;
const PLACEHOLDER_BOUNDS = { center: new THREE.Vector3(), radius: 10 };

const lightAxes = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
const lightBasis = new THREE.Matrix4();
const snapped = new THREE.Vector3();
const world = new THREE.Vector3();
const toLight = new THREE.Vector3();
const lightPos = new THREE.Vector3();
const targetPos = new THREE.Vector3();
const ORIGIN = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

interface ShadowFit {
  light: THREE.DirectionalLight;
  bounds: Pick<SceneBounds, 'center' | 'radius'> | null;
  shadows: boolean;
  mapSize: number;
  /** Writes the unit direction from the scene towards the light. */
  direction: (out: THREE.Vector3) => THREE.Vector3;
}

/**
 * Keeps a directional light's shadow map on the part of the scene being looked at: centred on the
 * orbit target, as wide as the view is deep, in steps, and snapped to whole shadow texels so the
 * edges do not shimmer while the camera moves. The map is drawn again only when that region changes
 * or something that casts shadows does (see `useRedraw`). Without orbit controls (a preview) the whole
 * scene is the region.
 *
 * Only the light's position is moved (its direction never changes). A light the scene exported has its
 * target as a child, which moves with it, so the direction is kept; a light that owns a free target
 * (the studio's) has the target moved to the focus.
 */
function useShadowFit({ light, bounds, shadows, mapSize, direction }: ShadowFit): void {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3 } | null;
  const gl = useThree((s) => s.gl);
  const { shadowsChanged } = useRedraw();
  const fitted = useRef('');
  const { center, radius } = bounds ?? PLACEHOLDER_BOUNDS;

  useEffect(() => {
    light.shadow.mapSize.set(mapSize, mapSize);
    // A map made at another size is replaced when the light next draws one.
    light.shadow.map?.dispose();
    light.shadow.map = null;
    light.shadow.bias = -0.0004;
    light.shadow.radius = 4;
    fitted.current = '';
    shadowsChanged();
  }, [light, center, radius, shadows, mapSize, shadowsChanged]);

  useFrame(() => {
    if (!shadows) return;
    const target = controls?.target ?? center;
    const widest = radius * 1.2;
    const smallest = Math.max(radius * 0.05, 1);
    let half = widest;
    if (controls) {
      const wanted = Math.max(camera.position.distanceTo(target) * 0.9, smallest);
      half = Math.min(widest, smallest * SHADOW_STEP ** Math.ceil(Math.log(wanted / smallest) / Math.log(SHADOW_STEP)));
    }
    const whole = half >= widest;
    const focus = whole ? center : target;
    const dir = direction(toLight);

    // Snap the focus to the shadow map's texel grid, on the axes the light looks across.
    const texel = (2 * half) / mapSize;
    lightBasis.lookAt(dir, ORIGIN, UP).extractBasis(lightAxes.x, lightAxes.y, lightAxes.z);
    const x = Math.round(focus.dot(lightAxes.x) / texel) * texel - focus.dot(lightAxes.x);
    const y = Math.round(focus.dot(lightAxes.y) / texel) * texel - focus.dot(lightAxes.y);
    snapped.copy(focus).addScaledVector(lightAxes.x, x).addScaledVector(lightAxes.y, y);

    const key = `${half.toFixed(4)}|${snapped.x.toFixed(4)}|${snapped.y.toFixed(4)}|${snapped.z.toFixed(4)}|${dir.x.toFixed(4)}|${dir.y.toFixed(4)}|${dir.z.toFixed(4)}`;
    if (key === fitted.current) return;
    fitted.current = key;

    const distance = radius * 2.4;
    world.copy(snapped).addScaledVector(dir, distance);
    if (light.target.parent === light) {
      // The exported light: move it along its own axis, its target child comes with it.
      if (light.parent) light.parent.worldToLocal(world);
      light.position.copy(world);
      light.updateWorldMatrix(true, true);
    } else {
      light.position.copy(world);
      light.target.position.copy(snapped);
      light.target.updateMatrixWorld();
    }
    const cam = light.shadow.camera;
    cam.left = -half;
    cam.right = half;
    cam.top = half;
    cam.bottom = -half;
    // Deep enough to hold the whole scene along the light's direction, wherever the focus is in it.
    cam.near = Math.max(0.1, distance - radius * 2);
    cam.far = distance + radius * 2;
    cam.updateProjectionMatrix();
    light.shadow.normalBias = texel * 1.5;
    // This frame is being drawn already; it only has to draw the shadow map too.
    gl.shadowMap.needsUpdate = true;
  });
}

/**
 * The studio look's lights (the environment map comes from the host): a warm key from the front
 * left, high, casting soft shadows, and a cool sky fill. The lights exist before the scene does
 * (`bounds` null), so the scene's shaders are built against them.
 */
export function StudioLights({ bounds, shadows, tier }: { bounds: Pick<SceneBounds, 'center' | 'radius'> | null; shadows: boolean; tier: QualityTier }) {
  const light = useMemo(() => new THREE.DirectionalLight('#fff3e2', 2.1), []);
  const mapSize = shadowMapSize(tier);

  useEffect(() => {
    light.castShadow = shadows;
  }, [light, shadows]);
  useShadowFit({ light, bounds, shadows, mapSize, direction: (out) => out.copy(STUDIO_DIRECTION) });
  useEffect(() => () => light.dispose(), [light]);

  return (
    <>
      <hemisphereLight args={['#dfe6f0', '#3a3530', 0.55]} />
      <primitive object={light} />
      <primitive object={light.target} />
    </>
  );
}

/**
 * The game look's shadow: the sun the scene exported (`sun` in the extension) is the one light that
 * casts a realtime shadow, with the same fitted map the studio's key light has. The scene's other
 * lights come from the file as they are, without shadows. Dynamic objects get the sun's shadow; the
 * baked shadows are in the lightmaps. When the scene has no sun, nothing casts.
 */
function GameSunShadow({ root, game, bounds, shadows, tier }: { root: THREE.Object3D; game: GameScene; bounds: SceneLights['bounds']; shadows: boolean; tier: QualityTier }) {
  const sun = useMemo(() => findSunLight(root, game.moody.scene.sun), [root, game]);
  const fallback = useMemo(() => new THREE.DirectionalLight(), []);
  const light = sun ?? fallback;
  const mapSize = shadowMapSize(tier);

  useShadowFit({
    light,
    bounds,
    shadows: shadows && sun !== null,
    mapSize,
    direction: (out) => {
      if (!sun) return out.set(0, 1, 0);
      // From the scene towards the light: where the light is, seen from its target.
      sun.getWorldPosition(lightPos);
      sun.target.getWorldPosition(targetPos);
      const d = out.copy(lightPos).sub(targetPos);
      return d.lengthSq() > 1e-8 ? d.normalize() : out.set(0, 1, 0);
    },
  });
  useEffect(() => {
    if (sun) sun.castShadow = shadows;
  }, [sun, shadows]);
  useEffect(() => () => fallback.dispose(), [fallback]);
  return null;
}

type SceneLights = { bounds: Pick<SceneBounds, 'center' | 'radius'> | null };

/**
 * The lights of whichever look is in force: the studio's key light and fill, or (game look) the
 * scene's own lights, which live in the scene graph, plus the sun's shadow. `root` is what the Stage is
 * showing, null while it loads.
 */
export function LookLights({ root, bounds, shadows }: { root: THREE.Object3D | null; bounds: SceneLights['bounds']; shadows: boolean }) {
  const look = useEffectiveLook();
  const tier = useQualityTier();
  const game = useStage((s) => s.game);
  if (look === 'game' && game) return root ? <GameSunShadow root={root} game={game} bounds={bounds} shadows={shadows} tier={tier} /> : null;
  return <StudioLights bounds={bounds} shadows={shadows} tier={tier} />;
}
