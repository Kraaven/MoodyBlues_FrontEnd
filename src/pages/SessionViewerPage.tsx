import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls as DreiOrbitControls, Grid } from '@react-three/drei';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import * as THREE from 'three';
import { Navbar } from '../components/Navbar';
import { TransportBar } from '../components/session/TransportBar';
import { TimelineScrubber, type TimelineMarker } from '../components/session/TimelineScrubber';
import { EventTimeline } from '../components/session/EventTimeline';
import { SessionInfoPanel } from '../components/session/SessionInfoPanel';
import { SessionStatusChip } from '../components/StatusChip';
import { FieldError } from '../components/ui/Input';
import { api, ApiError, fetchSessionReplay } from '../lib/api';
import {
  createGltfLoader,
  disposeGltfLoaderBundle,
  disposeObject3D,
  fetchSceneArrayBuffer,
  parseGlb,
  type GltfLoaderBundle,
} from '../viewer/loadScene';
import { parseReplay, type Replay, type ReplayEvent } from '../viewer/replay/replayFile';
import { ReplayPlayer } from '../viewer/replay/ReplayPlayer';
import type { ProjectDetail, SessionDetail } from '../lib/types';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Frames the camera so the given object (and its descendants) fill the view. */
function fitCameraToObject(camera: THREE.PerspectiveCamera, controls: { target: THREE.Vector3 } | null, object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getBoundingSphere(new THREE.Sphere()).radius;
  const distance = radius / Math.sin((camera.fov * Math.PI) / 360);

  const direction = camera.position.clone().sub(center).normalize();
  camera.position.copy(center).add(direction.multiplyScalar(distance * 1.1));
  camera.near = Math.max(0.01, distance / 1000);
  camera.far = Math.max(1000, distance * 10);
  camera.lookAt(center);
  controls?.target.copy(center);
  camera.updateProjectionMatrix();
}

/** Spawn and delete markers, plus session markers that indicate missing data. */
function buildMarkers(events: ReplayEvent[]): TimelineMarker[] {
  const markers: TimelineMarker[] = [];
  for (const e of events) {
    if (e.type === 'Spawn' || e.type === 'Delete') markers.push({ time: e.time, type: e.type });
    else if (e.type === 'DataGap' || (e.type === 'Connected' && e.a > 0)) markers.push({ time: e.time, type: 'Session' });
  }
  return markers;
}

const NOT_READY_COPY: Record<string, { title: string; body: string }> = {
  Recording: { title: 'Still recording', body: 'The game is still streaming this session. The replay is built once it ends.' },
  Queued: { title: 'Waiting to build the replay', body: 'The session has ended. It is queued, or waiting for its scene upload to finish.' },
  Compiling: { title: 'Building the replay', body: 'The recorded events are being turned into animation. This page updates when it is done.' },
};

export function SessionViewerPage() {
  const { projectId, sceneId, sessionId } = useParams<{ projectId: string; sceneId: string; sessionId: string }>();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedObject, setSelectedObject] = useState<{ objectId: number; name: string; pos: THREE.Vector3 } | null>(null);
  const [showEventTimeline, setShowEventTimeline] = useState(true);

  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);

  const playerRef = useRef<ReplayPlayer | null>(null);
  const controlsRef = useRef<React.ComponentRef<typeof DreiOrbitControls> | null>(null);
  const wasPlayingBeforeScrubRef = useRef(false);

  useEffect(() => {
    if (!projectId) return;
    api
      .get<ProjectDetail>(`/api/projects/${projectId}`)
      .then(setProject)
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load project.'));
  }, [projectId]);

  // Load the session, polling while its replay is still being produced.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = () => {
      api
        .get<SessionDetail>(`/api/sessions/${encodeURIComponent(sessionId)}`)
        .then((s) => {
          if (cancelled) return;
          setSession(s);
          if (s.status !== 'Ready' && s.status !== 'Failed') timer = setTimeout(load, 4000);
        })
        .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Failed to load session.'));
    };

    load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  const isReady = session?.status === 'Ready';

  useEffect(() => {
    if (!sessionId || !isReady) return;
    let cancelled = false;
    fetchSessionReplay(sessionId)
      .then((buffer) => !cancelled && setReplay(parseReplay(buffer)))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load the replay.'));
    return () => {
      cancelled = true;
    };
  }, [sessionId, isReady]);

  const onScrub = useCallback((time: number) => {
    playerRef.current?.seek(time);
    setCurrentTime(time);
  }, []);

  const onScrubStart = useCallback(() => {
    wasPlayingBeforeScrubRef.current = isPlaying;
    setIsPlaying(false);
  }, [isPlaying]);

  const onScrubEnd = useCallback(() => {
    if (wasPlayingBeforeScrubRef.current) {
      wasPlayingBeforeScrubRef.current = false;
      setIsPlaying(true);
    }
  }, []);

  const onTogglePlay = useCallback(() => {
    setIsPlaying((playing) => {
      const player = playerRef.current;
      // Pressing play at the end starts again from the beginning.
      if (!playing && player && player.currentTime >= player.duration) player.seek(0);
      return !playing;
    });
  }, []);

  const onPlaybackEnded = useCallback(() => setIsPlaying(false), []);

  const markers = useMemo(() => (replay ? buildMarkers(replay.events) : []), [replay]);
  const events = replay?.events ?? [];

  if (!projectId || !sceneId || !sessionId) return null;

  const scene = project?.scenes.find((s) => s.sceneId === sceneId);
  const title = scene?.displayName ?? sceneId;
  const duration = replay?.durationSeconds ?? session?.durationSeconds ?? 0;
  const notReady = session != null && !isReady;

  const warnings: string[] = [];
  if (session && isReady) {
    if (!session.endedCleanly) warnings.push('The game stopped streaming without ending the session (crash, kill or lost connection); the end may be missing.');
    if (session.hardClamps > 0) warnings.push(`${session.hardClamps} transform value(s) exceeded the configured ranges and are wrong. Raise the ranges in MoodyBluesClientConfig.`);
    if (session.droppedEvents > 0) warnings.push(`${session.droppedEvents} event(s) were dropped on the client because the connection could not keep up.`);
    if (session.errorMessage) warnings.push(session.errorMessage);
  }

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
              <SessionStatusChip status={session.status} />
              <span className="font-mono text-[10px] text-ink-faint">{new Date(session.createdAtUtc).toLocaleString()}</span>
              <span className="font-mono text-[10px] text-ink-faint">{session.objectCount} objects</span>
              {session.spawnCount > 0 && <span className="font-mono text-[10px] text-ink-faint">{session.spawnCount} spawns</span>}
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="px-4 py-2">
          <FieldError>{error}</FieldError>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="space-y-1 border-b border-hairline bg-amber-500/5 px-4 py-2">
          {warnings.map((w) => (
            <p key={w} className="flex items-start gap-2 text-xs text-amber-200/90">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {w}
            </p>
          ))}
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        {notReady ? (
          <div className="flex h-full items-center justify-center px-6">
            <div className="max-w-md text-center">
              {session!.status === 'Failed' ? (
                <>
                  <p className="text-sm font-medium text-ink">This session could not be replayed</p>
                  <p className="mt-1 text-sm text-ink-muted">{session!.errorMessage ?? 'An unknown error occurred.'}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-ink">{NOT_READY_COPY[session!.status]?.title}</p>
                  <p className="mt-1 text-sm text-ink-muted">{NOT_READY_COPY[session!.status]?.body}</p>
                </>
              )}
            </div>
          </div>
        ) : project && session && replay ? (
          <div className="absolute inset-0 viewer-canvas-bg">
            <Canvas camera={{ position: [3, 2, 4], fov: 45 }} gl={{ antialias: true, alpha: true }}>
              <hemisphereLight args={['#ffffff', '#26262e', 0.9]} />
              <directionalLight position={[5, 8, 5]} intensity={1.4} />
              <directionalLight position={[-5, -2, -5]} intensity={0.4} />
              <Grid args={[20, 20]} cellColor="#2A2A30" sectionColor="#3A3A40" fadeDistance={25} infiniteGrid />
              <DreiOrbitControls ref={controlsRef} makeDefault enableDamping dampingFactor={0.08} />
              <ReplayScene
                developerId={project.developerId}
                sceneId={sceneId}
                sceneHash={session.sceneHash}
                replay={replay}
                playerRef={playerRef}
                controlsRef={controlsRef}
                isPlaying={isPlaying}
                speed={speed}
                onTimeUpdate={setCurrentTime}
                onEnded={onPlaybackEnded}
                onLoadError={setError}
                onObjectClick={setSelectedObject}
              />
            </Canvas>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="font-mono text-[11px] text-ink-faint">Loading…</p>
          </div>
        )}

        {selectedObject && !showEventTimeline && (
          <SessionInfoPanel
            objectId={selectedObject.objectId}
            name={selectedObject.name}
            posX={selectedObject.pos.x}
            posY={selectedObject.pos.y}
            posZ={selectedObject.pos.z}
            onClose={() => setSelectedObject(null)}
          />
        )}

        {showEventTimeline && !notReady && replay && (
          <EventTimeline events={events} currentTime={currentTime} onSeek={onScrub} onClose={() => setShowEventTimeline(false)} />
        )}
      </div>

      <div className="shrink-0 border-t border-hairline bg-surface px-4 py-2.5">
        <div className="mx-auto max-w-5xl space-y-1.5">
          <TimelineScrubber
            value={currentTime}
            max={duration}
            onChange={onScrub}
            onScrubStart={onScrubStart}
            onScrubEnd={onScrubEnd}
            markers={markers}
            disabled={notReady || !replay}
          />
          <div className="flex items-center justify-between gap-3">
            <TransportBar
              isPlaying={isPlaying}
              onTogglePlay={onTogglePlay}
              speed={speed}
              onSpeedChange={setSpeed}
              currentLabel={formatTime(currentTime)}
              totalLabel={formatTime(duration)}
            />
            {replay && !showEventTimeline && (
              <button
                type="button"
                onClick={() => setShowEventTimeline(true)}
                className="rounded-full px-2.5 py-0.5 font-mono text-[10px] text-ink-muted transition hover:bg-white/5 hover:text-ink"
              >
                Events ({events.length})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- R3F component: loads the scene revision and drives the replay player ----

interface ReplaySceneProps {
  developerId: string;
  sceneId: string;
  sceneHash: string;
  replay: Replay;
  playerRef: React.MutableRefObject<ReplayPlayer | null>;
  controlsRef: React.MutableRefObject<React.ComponentRef<typeof DreiOrbitControls> | null>;
  isPlaying: boolean;
  speed: number;
  onTimeUpdate: (time: number) => void;
  onEnded: () => void;
  onLoadError: (message: string | null) => void;
  onObjectClick: (info: { objectId: number; name: string; pos: THREE.Vector3 } | null) => void;
}

function ReplayScene({
  developerId,
  sceneId,
  sceneHash,
  replay,
  playerRef,
  controlsRef,
  isPlaying,
  speed,
  onTimeUpdate,
  onEnded,
  onLoadError,
  onObjectClick,
}: ReplaySceneProps) {
  const { gl, camera, scene: r3fScene } = useThree();
  const [loaded, setLoaded] = useState(false);
  const gltfSceneRef = useRef<THREE.Group | null>(null);
  const lastUiUpdateRef = useRef(0);
  const endedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let bundle: GltfLoaderBundle | null = null;

    (async () => {
      try {
        // The exact revision the session was recorded in (Unity Spec 5.1).
        const buffer = await fetchSceneArrayBuffer(developerId, sceneId, sceneHash);
        if (cancelled) return;
        bundle = createGltfLoader(gl);
        const gltf = await parseGlb(bundle.loader, buffer);
        if (cancelled) {
          disposeObject3D(gltf.scene);
          return;
        }

        // Inactive GameObjects are exported with extras.isHidden (Unity Spec 13.3).
        gltf.scene.traverse((node) => {
          if (node.userData?.isHidden === true) node.visible = false;
        });

        gltfSceneRef.current = gltf.scene;
        r3fScene.add(gltf.scene);
        fitCameraToObject(camera as THREE.PerspectiveCamera, controlsRef.current, gltf.scene);

        playerRef.current = new ReplayPlayer(gltf.scene, replay);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) onLoadError(err instanceof Error ? err.message : 'Failed to load the scene.');
      }
    })();

    return () => {
      cancelled = true;
      playerRef.current?.dispose();
      playerRef.current = null;
      if (gltfSceneRef.current) {
        r3fScene.remove(gltfSceneRef.current);
        disposeObject3D(gltfSceneRef.current);
        gltfSceneRef.current = null;
      }
      if (bundle) disposeGltfLoaderBundle(bundle);
      setLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [developerId, sceneId, sceneHash, replay]);

  useFrame((_, delta) => {
    const player = playerRef.current;
    if (!player || !loaded) return;

    player.playing = isPlaying;
    player.speed = speed;
    player.update(delta);

    if (isPlaying && !player.playing && !endedRef.current) {
      endedRef.current = true;
      onEnded();
    } else if (player.playing) {
      endedRef.current = false;
    }

    const now = performance.now();
    if (now - lastUiUpdateRef.current >= 100) {
      lastUiUpdateRef.current = now;
      onTimeUpdate(player.currentTime);
    }
  });

  // Click-to-inspect. Hidden objects (inactive, deleted, templates) are not pickable.
  useEffect(() => {
    if (!loaded) return;
    const dom = gl.domElement;
    const raycaster = new THREE.Raycaster();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) return; // a drag, not a click
      const root = gltfSceneRef.current;
      if (!root) return;

      const rect = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(root, true).find((h) => ReplayPlayer.isEffectivelyVisible(h.object));

      for (let obj: THREE.Object3D | null = hit?.object ?? null; obj; obj = obj.parent) {
        if (typeof obj.userData?.objectId === 'number') {
          onObjectClick({ objectId: obj.userData.objectId, name: obj.name || '', pos: obj.getWorldPosition(new THREE.Vector3()) });
          return;
        }
      }
      onObjectClick(null);
    };

    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointerup', onPointerUp);
    return () => {
      dom.removeEventListener('pointerdown', onPointerDown);
      dom.removeEventListener('pointerup', onPointerUp);
    };
  }, [loaded, gl, camera, onObjectClick]);

  return null; // the scene is added imperatively
}
