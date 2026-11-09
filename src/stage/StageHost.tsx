import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Atmosphere } from '../viewer/core/Atmosphere';
import { StudioEnvironment } from '../viewer/core/StudioEnvironment';
import { useToast } from '../ui/Toast';
import { cn } from '../ui/cn';
import { CameraRig } from './CameraRig';
import { DEFAULT_CAMERA, useStage } from './store';
import { webglSupported } from './support';
import { Trace } from './Trace';

/** Frame statistics for the dev lab and the Debug panel; only runs while something asked for them. */
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
    const info = gl.info.render;
    state.setStats({
      fps: w.frames / w.time,
      avgMs: (w.time / w.frames) * 1000,
      maxMs: w.max * 1000,
      calls: info.calls,
      triangles: info.triangles,
      lines: info.lines,
      points: info.points,
      quality: state.traceQuality,
    });
    w.time = 0;
    w.frames = 0;
    w.max = 0;
  });
  return null;
}

function Content() {
  const content = useStage((s) => s.view.content);
  return content === 'trace' ? <Trace /> : null;
}

/**
 * The one persistent WebGL canvas (DESIGN.md 4.1). It sits behind the whole app and is never
 * unmounted while the app is open. Views choose what it shows through `useStageView`.
 *
 * Without WebGL, or while the context is lost, a plain gradient takes its place and the rest of the
 * app carries on.
 *
 * The canvas is created the first time a view wants to draw, not at startup, so a phone on the
 * sign-in screen, or a page that does not use the Stage yet, spends no GPU work at all.
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
    <div aria-hidden="true" className="stage-fallback pointer-events-none fixed inset-0 -z-10">
      {supported.current && started && (
        <div
          className={cn('absolute inset-0', status !== 'ok' && 'invisible', !active && 'transition-opacity duration-[600ms]')}
          // While drawing, the camera rig animates the opacity through --stage-dim. While paused it
          // cannot, so the store's value is used and CSS does the fade.
          style={{ opacity: active ? 'var(--stage-dim, 1)' : dim }}
        >
          <Canvas
            frameloop={active ? 'always' : 'never'}
            dpr={[1, 1.5]}
            camera={{ position: DEFAULT_CAMERA.position, fov: DEFAULT_CAMERA.fov, near: 0.1, far: 2000 }}
            gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
            onCreated={({ gl }) => {
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
            <Content />
            <StatsReporter />
          </Canvas>
        </div>
      )}
    </div>
  );
}
