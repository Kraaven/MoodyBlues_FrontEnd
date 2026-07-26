import { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import { ArrowLeft } from 'lucide-react';
import * as THREE from 'three';
import { Navbar } from '../components/Navbar';
import { TransportBar } from '../components/session/TransportBar';
import { TimelineScrubber } from '../components/session/TimelineScrubber';
import { SessionInfoPanel } from '../components/session/SessionInfoPanel';
import { FieldError } from '../components/ui/Input';
import { api, ApiError, fetchSessionAnimation } from '../lib/api';
import { createGltfLoader, fetchSceneArrayBuffer, parseGlb } from '../viewer/loadScene';
import { SessionAnimationDriver } from '../viewer/session/SessionAnimationDriver';
import type { ProjectDetail, SessionDetail } from '../lib/types';

/** Converts seconds to MM:SS string like TimelineScrubber uses. */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Frames the camera so the given object (and its descendants) fill the view. */
function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3 } | null,
  object: THREE.Object3D,
) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;

  const center = new THREE.Vector3();
  box.getCenter(center);

  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = sphere.radius;

  const fov = camera.fov * (Math.PI / 180);
  const distance = (radius * 2) / Math.tan(fov / 2);

  const direction = camera.position.clone().sub(center).normalize();
  camera.position.copy(center).add(direction.multiplyScalar(distance * 1.5));
  camera.lookAt(center);

  if (controls) {
    controls.target.copy(center);
  }

  camera.updateProjectionMatrix();
}

export function SessionViewerPage() {
  const { projectId, sceneId, sessionId } = useParams<{ projectId: string; sceneId: string; sessionId: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedObject, setSelectedObject] = useState<{ objectId: number; name: string; pos: THREE.Vector3 } | null>(null);

  // Transport state
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const duration = session?.durationSeconds ?? 0;

  const driverRef = useRef<SessionAnimationDriver | null>(null);
  const controlsRef = useRef<InstanceType<typeof OrbitControls> | null>(null);

  useEffect(() => {
    if (!projectId) return;
    api
      .get<ProjectDetail>(`/api/projects/${projectId}`)
      .then(setProject)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load project.'));
  }, [projectId]);

  useEffect(() => {
    if (!sessionId) return;
    api
      .get<SessionDetail>(`/api/sessions/${sessionId}`)
      .then(setSession)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load session.'));
  }, [sessionId]);

  const onScrub = useCallback((time: number) => {
    driverRef.current?.seekTo(time);
    setCurrentTime(time);
  }, []);

  const onTogglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  if (!projectId || !sceneId || !sessionId) return null;

  const scene = project?.scenes.find((s) => s.sceneId === sceneId);
  const title = scene?.displayName ?? sceneId;

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <Navbar />

      <header className="flex h-11 shrink-0 items-center justify-between border-b border-hairline px-4">
        <div className="flex items-center gap-3">
          <Link
            to={`/projects/${projectId}/scenes/${encodeURIComponent(sceneId)}`}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm text-ink-muted transition hover:bg-white/5 hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="h-5 w-px bg-hairline" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">Session playback</p>
            <p className="text-sm font-medium leading-tight text-ink">{title}</p>
          </div>

          {session && (
            <div className="flex items-center gap-2">
              <div className="h-5 w-px bg-hairline" />
              <span className="font-mono text-[10px] text-ink-faint">
                {new Date(session.createdAtUtc).toLocaleDateString()}
              </span>
              <span className="font-mono text-[10px] text-ink-faint">
                {session.objectCount} objects
              </span>
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="px-4 py-2">
          <FieldError>{error}</FieldError>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        {project && (
          <div className="absolute inset-0 viewer-canvas-bg">
            <Canvas camera={{ position: [3, 2, 4], fov: 45 }} gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }}>
              <hemisphereLight args={['#ffffff', '#26262e', 0.9]} />
              <directionalLight position={[5, 8, 5]} intensity={1.4} castShadow />
              <directionalLight position={[-5, -2, -5]} intensity={0.4} />
              <Grid args={[20, 20]} cellColor="#2A2A30" sectionColor="#3A3A40" fadeDistance={25} infiniteGrid />
              <OrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.08} />
              <SessionScene
                developerId={project.developerId}
                sceneId={sceneId}
                sessionId={sessionId}
                driverRef={driverRef}
                controlsRef={controlsRef}
                isPlaying={isPlaying}
                speed={speed}
                currentTimeRef={{ get: () => currentTime, set: setCurrentTime }}
                onObjectClick={setSelectedObject}
              />
            </Canvas>
          </div>
        )}

        {selectedObject && (
          <SessionInfoPanel
            objectId={selectedObject.objectId}
            name={selectedObject.name}
            posX={selectedObject.pos.x}
            posY={selectedObject.pos.y}
            posZ={selectedObject.pos.z}
            onClose={() => setSelectedObject(null)}
          />
        )}
      </div>

      {/* Bottom transport bar */}
      <div className="shrink-0 border-t border-hairline bg-surface px-4 py-2.5">
        <div className="mx-auto max-w-5xl space-y-1.5">
          <TimelineScrubber value={currentTime} max={duration} onChange={onScrub} />
          <TransportBar
            isPlaying={isPlaying}
            onTogglePlay={onTogglePlay}
            speed={speed}
            onSpeedChange={setSpeed}
            currentLabel={formatTime(currentTime)}
            totalLabel={formatTime(duration)}
          />
        </div>
      </div>
    </div>
  );
}

// ---- R3F component that loads scene + animation and drives playback ----

interface SessionSceneProps {
  developerId: string;
  sceneId: string;
  sessionId: string;
  driverRef: React.MutableRefObject<SessionAnimationDriver | null>;
  controlsRef: React.MutableRefObject<InstanceType<typeof OrbitControls> | null>;
  isPlaying: boolean;
  speed: number;
  currentTimeRef: { get: () => number; set: (t: number) => void };
  onObjectClick: (info: { objectId: number; name: string; pos: THREE.Vector3 } | null) => void;
}

function SessionScene({ developerId, sceneId, sessionId, driverRef, controlsRef, isPlaying, speed, currentTimeRef, onObjectClick }: SessionSceneProps) {
  const { gl, camera, scene: r3fScene } = useThree();
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const gltfSceneRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const clockRef = useRef(new THREE.Clock());

  // Load GLB + animation on mount
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [buffer, animation] = await Promise.all([
          fetchSceneArrayBuffer(developerId, sceneId),
          fetchSessionAnimation(sessionId),
        ]);

        if (cancelled) return;

        const loader = createGltfLoader(gl);
        const gltf = await parseGlb(loader, buffer);
        if (cancelled) return;

        gltfSceneRef.current = gltf.scene;

        // Hide all TemplateObjectId nodes in the scene (they're for cloning only).
        // Also hide any isHidden-flagged nodes the exporter marked.
        gltf.scene.traverse((node) => {
          if (node.userData && typeof node.userData.isHidden === 'boolean' && node.userData.isHidden === true) {
            node.visible = false;
          }
        });

        r3fScene.add(gltf.scene);

        // Frame the camera to fit all visible content
        const perspCamera = camera as THREE.PerspectiveCamera;
        fitCameraToObject(perspCamera, controlsRef.current, gltf.scene);

        const driver = new SessionAnimationDriver(gltf.scene, animation);
        driverRef.current = driver;
        setLoaded(true);
        clockRef.current.start();
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Failed to load session.');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (driverRef.current) {
        driverRef.current.dispose();
        driverRef.current = null;
      }
      if (gltfSceneRef.current) {
        r3fScene.remove(gltfSceneRef.current);
        gltfSceneRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [developerId, sceneId, sessionId]);

  // Per-frame driver update
  useFrame(() => {
    const driver = driverRef.current;
    if (!driver || !loaded) return;

    driver.playing = isPlaying;
    const rawDelta = clockRef.current.getDelta() * speed;
    driver.update(rawDelta);
    currentTimeRef.set(driver.currentTime);
  });

  // Use pointer events on the root div via a useThree effect to set up click handling
  useEffect(() => {
    if (!loaded || !gltfSceneRef.current) return;

    const domElement = gl.domElement;
    let mouseDown = false;
    let mouseMove = false;

    const onPointerDown = () => { mouseDown = true; mouseMove = false; };
    const onPointerMove = () => { if (mouseDown) mouseMove = true; };
    const onPointerUp = (e: PointerEvent) => {
      if (!mouseDown || mouseMove) { mouseDown = false; return; }
      mouseDown = false;

      const rect = domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      const camera = gl.xr.getCamera();
      raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), camera);

      if (!gltfSceneRef.current) return;
      const hits = raycasterRef.current.intersectObjects(gltfSceneRef.current.children, true);
      if (hits.length > 0) {
        // Walk up to find the first parent with an objectId userData
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj) {
          if (obj.userData && typeof obj.userData.objectId === 'number') {
            onObjectClick({ objectId: obj.userData.objectId, name: obj.name || '', pos: obj.position.clone() });
            return;
          }
          obj = obj.parent;
        }
      }
      onObjectClick(null);
    };

    domElement.addEventListener('pointerdown', onPointerDown);
    domElement.addEventListener('pointermove', onPointerMove);
    domElement.addEventListener('pointerup', onPointerUp);

    return () => {
      domElement.removeEventListener('pointerdown', onPointerDown);
      domElement.removeEventListener('pointermove', onPointerMove);
      domElement.removeEventListener('pointerup', onPointerUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, gl, onObjectClick]);

  if (loadError) {
    return null;
  }

  return null; // The scene is added imperatively
}
