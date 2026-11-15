import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Atmosphere } from '../viewer/core/Atmosphere';
import { StudioEnvironment } from '../viewer/core/StudioEnvironment';
import { debugEnabled } from '../debug/enabled';
import { useToast } from '../ui/Toast';
import { cn } from '../ui/cn';
import { CameraRig } from './CameraRig';
import { DemoScene } from './DemoScene';
import { SceneContent } from './SceneContent';
import { DEFAULT_CAMERA, useStage } from './store';
import { reducedMotion, webglSupported } from './support';
import { Trace } from './Trace';

// The studio (inspection and replay) loads only when a scene is opened in 3D.
const StudioContent = lazy(() => import('../studio/StudioContent'));
// Debug toggles only load with ?debug.
const DebugEffects = lazy(() => import('../debug/DebugEffects'));
const debugOn = debugEnabled();

/** Frame statistics for the Debug panel and the scene stats; only runs while something asked for them. */
function StatsReporter() {
  const window = useRef({ time: 0, frames: 0, max: 0 });
  useFrame(({ gl }, delta) => {
    const state = useStage.getState();
    if (!state.statsEnabled) return;
    const w = window.current;
    w.time += delta;
    w.frames += 1;
    w.max = Math.max(w.max, delta);
    if (w.time < 0.5) return;
    const info = gl.info;
    state.setStats({
      fps: w.frames / w.time,
      avgMs: (w.time / w.frames) * 1000,
      maxMs: w.max * 1000,
      calls: info.render.calls,
      triangles: info.render.triangles,
      lines: info.render.lines,
      points: info.render.points,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      quality: state.traceQuality,
    });
    w.time = 0;
    w.frames = 0;
    w.max = 0;
  });
  return null;
}

/**
 * Orbit, pan and zoom, listening on the view's StageSurface. Present only for views that asked for
 * free control and placed a surface. With idle orbit it turns slowly, stops the moment the user
 * touches it, and starts again four seconds after they let go. Shift + drag pans.
 */
function StageControls() {
  const surface = useStage((s) => s.surface);
  const control = useStage((s) => s.view.control);
  const idleOrbit = useStage((s) => s.view.idleOrbit ?? false);
  const zoom = useStage((s) => s.view.zoom ?? true);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const timer = useRef<number | null>(null);
  const turning = idleOrbit && !reducedMotion();

  useEffect(() => {
    if (controls.current) controls.current.autoRotate = turning;
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [turning]);

  if (control !== 'free' || !surface) return null;
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      domElement={surface}
      enableDamping
      dampingFactor={0.08}
      enableZoom={zoom}
      maxPolarAngle={Math.PI * 0.495}
      autoRotate={turning}
      autoRotateSpeed={0.35}
      onStart={() => {
        if (timer.current) window.clearTimeout(timer.current);
        if (controls.current) controls.current.autoRotate = false;
      }}
      onEnd={() => {
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          if (controls.current) controls.current.autoRotate = turning;
        }, 4000);
      }}
    />
  );
}

function Content() {
  const content = useStage((s) => s.view.content);
  if (content === 'trace') return <Trace />;
  if (content === 'demo') return <DemoScene />;
  if (content === 'scene') return <SceneContent />;
  if (content === 'studio') {
    return (
      <Suspense fallback={null}>
        <StudioContent />
      </Suspense>
    );
  }
  return null;
}

/**
 * The one persistent WebGL canvas. It sits behind the whole app and is never unmounted while the app
 * is open. Views choose what it shows through `useStageView`, and pages show it through a
 * StageWindow.
 *
 * Without WebGL, or while the context is lost, a plain gradient takes its place and the rest of the
 * app carries on. The canvas is created the first time a view wants to draw, so a page that never
 * shows 3D spends no GPU work at all.
 */
export default function StageHost() {
  const status = useStage((s) => s.status);
  const content = useStage((s) => s.view.content);
  const dim = useStage((s) => s.pose.dim);
  const active = content !== 'none';
  const notify = useToast();
  const supported = useRef(webglSupported());
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (active) setStarted(true);
  }, [active]);

  useEffect(() => {
    if (!supported.current) useStage.getState().setStatus('unsupported');
  }, []);

  return (
    <div aria-hidden="true" className={cn('pointer-events-none fixed inset-0 -z-10', active && status !== 'ok' && 'stage-fallback')}>
      {supported.current && started && (
        <div
          className={cn('absolute inset-0', status !== 'ok' && 'invisible', !active && 'transition-opacity duration-[600ms]')}
          // While drawing, the camera rig animates the opacity through --stage-dim. While paused it
          // cannot, so the store's value is used and CSS does the fade.
          style={{ opacity: active ? 'var(--stage-dim, 1)' : Math.min(dim, 0) }}
        >
          <Canvas
            frameloop={active ? 'always' : 'never'}
            dpr={[1, 1.75]}
            shadows={{ type: THREE.PCFSoftShadowMap }}
            camera={{ position: DEFAULT_CAMERA.position, fov: DEFAULT_CAMERA.fov, near: 0.1, far: 2000 }}
            gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
            onCreated={({ gl }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.05;
              const element = gl.domElement;
              element.addEventListener('webglcontextlost', (event) => {
                event.preventDefault();
                useStage.getState().setStatus('lost');
                notify('The 3D view lost its graphics context and is restoring.', 'error');
              });
              element.addEventListener('webglcontextrestored', () => useStage.getState().setStatus('ok'));
            }}
          >
            <Atmosphere />
            <StudioEnvironment />
            <CameraRig />
            <StageControls />
            <Content />
            <StatsReporter />
            {debugOn && (
              <Suspense fallback={null}>
                <DebugEffects />
              </Suspense>
            )}
          </Canvas>
        </div>
      )}
    </div>
  );
}
