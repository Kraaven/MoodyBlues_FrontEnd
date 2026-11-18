import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  Box,
  Braces,
  Bug,
  Crosshair,
  Expand,
  Eye,
  Hourglass,
  Image,
  Info,
  Keyboard,
  ListVideo,
  Network,
  Palette,
  RotateCw,
  Share,
  Shrink,
  SlidersHorizontal,
  SquareTerminal,
  TriangleAlert,
  X,
} from 'lucide-react';
import { downloadWithProgress, useProject, useRecompileSession, useScene, useSession, useSessions, useSharedSession } from '../api/queries';
import { ApiError, errorText } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { usePrefetchFocus } from '../prefetch/usePrefetchFocus';
import type { SceneVersion, SharedSessionDetail } from '../api/types';
import { parseReplay } from '../viewer/replay/replayFile';
import { useReplayBinding } from './binding';
import { Playback } from './playback';
import { StageNotice } from '../stage/StageNotice';
import { StageSurface } from '../stage/StageSurface';
import { idleView, useStage, type StageView } from '../stage/store';
import { useStageRegion } from '../stage/useStageInset';
import { useStageView } from '../stage/useStageView';
import { Button, IconButton, LinkButton } from '../ui/Button';
import { versionLabel } from '../ui/Chip';
import { ErrorState } from '../ui/States';
import { useToast } from '../ui/Toast';
import { cn } from '../ui/cn';
import { formatAgo, formatCaptured, sceneTitle, sessionHandle } from '../lib/format';
import { parseStartTime, viewLink } from '../lib/shareLink';
import { useElementHeight } from '../lib/useElementHeight';
import { useMediaQuery } from '../lib/useMediaQuery';
import { usePhoneLayout } from '../lib/usePhoneLayout';
import { ShareDialog } from '../share/ShareDialog';
import { WelcomeCard } from '../share/WelcomeCard';
import { shareLayout } from '../share/shareLayout';
import { panelAvailable, parseShareSettings } from '../share/shareSettings';
import { replayPath, sceneRef as sceneRefFor, type StudioSource } from './source';
import { useWindowTitle } from '../lib/useWindowTitle';
import { ShortcutsDialog, useStudioShortcuts } from './shortcuts';
import { useLocked, useStudio } from './studioStore';
import { PhoneSettings } from './PhoneSettings';
import { Timeline } from './Timeline';
import { DetailsWindow } from './windows/DetailsWindow';
import { LogsWindow } from './windows/LogsWindow';
import { GeometryWindow } from './windows/GeometryWindow';
import { HierarchyWindow } from './windows/HierarchyWindow';
import { InspectorWindow } from './windows/InspectorWindow';
import { MaterialsWindow } from './windows/MaterialsWindow';
import { RawWindow } from './windows/RawWindow';
import { TexturesWindow } from './windows/TexturesWindow';
import { ViewpointWindow } from './windows/ViewpointWindow';
import { RecordingsWindow } from './windows/RecordingsWindow';
import { windowActions } from './windows/windowStore';
import { FloatingWindows, WindowDock, WindowRail, type RailTool, type WindowDef } from './windows/WindowHost';

/**
 * The 3D studio: one scene version in the persistent Stage with the tool windows over it, and, in
 * a recordings window and, when a session is open, its timeline and events.
 *
 * `/scenes/:sceneId/view?version=N` inspects a version; `/scenes/:sceneId/sessions/:id?t=`
 * plays a session. Both are this page, so moving between them is a camera move
 * over the same loaded scene, never a reload.
 *
 * `/share/:token` is the same studio for an anonymous visitor: one public session, read only (see
 * StudioSource). It has no project, scene list, recordings or session actions, and never calls an
 * endpoint that needs sign-in.
 */
// The Debug window is for developers: its code is a separate chunk, requested only once it is opened.
const DebugWindow = lazy(() => import('../debug/DebugWindow'));

export default function StudioPage() {
  const { projectId, sceneId, sessionId, token } = useParams<{ projectId: string; sceneId: string; sessionId?: string; token?: string }>();
  const [params] = useSearchParams();
  const location = useLocation();
  const { user } = useAuth();
  const notify = useToast();
  const phone = usePhoneLayout();
  // A phone held sideways has no height to spare: its timeline is one row.
  const landscape = useMediaQuery('(orientation: landscape)');
  const project = useProject(projectId);
  usePrefetchFocus(projectId); // undefined on a share link: nothing to prefetch
  const scene = useScene(projectId, sceneId);
  const session = useSession(sessionId);
  const shared = useSharedSession(token);
  const sharedView = token !== undefined;
  const source = useMemo<StudioSource>(
    () => (token !== undefined ? { kind: 'share', token } : { kind: 'owner', projectId: projectId ?? '', sceneId: sceneId ?? '', sessionId: sessionId ?? null }),
    [token, projectId, sceneId, sessionId],
  );
  const [playback] = useState(() => new Playback());
  const sceneState = useStage((s) => s.scene);
  const region = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [sharing, setSharing] = useState<{ time: number } | null>(null);
  // The welcome card of a shared link: Play was pressed, and the card has gone.
  const [played, setPlayed] = useState(false);
  const [welcomed, setWelcomed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const player = useStudio((s) => s.player);
  const debugOpen = useStage((s) => s.debugOpen);

  const base = `/projects/${projectId}/scenes/${encodeURIComponent(sceneId ?? '')}`;
  const detail: SharedSessionDetail | undefined = sharedView ? shared.data?.session : session.data;
  // What the link's owner decided for its visitors (already resolved by the server); null in the owner's studio.
  const rawShareSettings = shared.data?.settings;
  const shareSettings = useMemo(() => (sharedView && shared.data ? parseShareSettings(rawShareSettings) : null), [sharedView, shared.data, rawShareSettings]);
  const hasSession = sharedView || Boolean(sessionId);
  const scope = sharedView ? 'share' : sessionId ? 'session' : 'scene';

  // ---- Which scene version is on screen ------------------------------------------------------
  const versions = useMemo(() => (scene.data ? [scene.data.current, ...scene.data.archived].filter((v): v is SceneVersion => v !== null) : []), [scene.data]);
  const requested = Number(params.get('version'));
  const sessionVersion = session.data ? (versions.find((v) => v.hash === session.data.sceneHash) ?? null) : null;
  const version: SceneVersion | null = sessionId ? sessionVersion : (versions.find((v) => v.version === requested) ?? scene.data?.current ?? null);
  const sceneRef = useMemo(() => {
    if (sharedView) return detail ? sceneRefFor(source, detail.sceneId, detail.sceneHash) : null;
    return projectId && sceneId && version ? sceneRefFor(source, scene.data?.sceneId ?? sceneId, version.hash) : null;
  }, [sharedView, detail, source, projectId, sceneId, version, scene.data?.sceneId]);

  // ---- The replay -------------------------------------------------------------------------------
  const status = detail?.status;
  const ready = status === 'Ready';
  const replayUrl = replayPath(source);
  const replay = useQuery({
    queryKey: ['replay', replayUrl, detail?.compiledAtUtc],
    enabled: Boolean(replayUrl && ready),
    staleTime: Infinity,
    gcTime: 60_000,
    queryFn: async ({ signal }) => {
      const buffer = await downloadWithProgress(
        replayUrl!,
        (received, total) => useStage.getState().setLoading('replay', { label: 'Downloading the replay', received, total }),
        signal,
      );
      useStage.getState().setLoading('replay', null);
      return parseReplay(buffer);
    },
  });
  useEffect(() => {
    if (replay.isError) useStage.getState().setLoading('replay', null);
    return () => useStage.getState().setLoading('replay', null);
  }, [replay.isError]);

  useEffect(() => {
    useReplayBinding.getState().bind(replay.data && hasSession ? replay.data : null, replay.data && hasSession ? playback : null);
    return () => useReplayBinding.getState().bind(null, null);
  }, [replay.data, playback, hasSession]);

  // A shared link applies its owner's settings once, when they arrive: the view settings, and the panels open at the start. They
  // replace whatever this browser remembers, and what the visitor then changes is not remembered.
  const hasShareSettings = shareSettings !== null;
  useLayoutEffect(() => {
    if (!shareSettings) return;
    useStudio.getState().enterShare(shareSettings);
    windowActions('share').replace(shareLayout(shareSettings.panels));
    return () => useStudio.getState().leaveShare();
    // Once per link: the owner editing the settings later does not move a visitor who is already watching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, hasShareSettings]);

  // Start at the link's ?t= (which wins) or its owner's start time, once per session, at the owner's speed.
  const urlStart = parseStartTime(params.get('t'));
  const startTime = urlStart > 0 ? urlStart : (shareSettings?.playback.startTime ?? 0);
  const startKnown = !sharedView || hasShareSettings;
  useEffect(() => {
    if (!startKnown) return;
    playback.time = startTime;
    playback.playing = startTime === 0;
    if (shareSettings) playback.setSpeed(shareSettings.playback.speed.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayUrl, startKnown]);

  // A shared link opens on the welcome card: the intro waits at the overview until Play.
  useEffect(() => {
    if (!sharedView) return;
    setPlayed(false);
    setWelcomed(false);
    useStudio.getState().setIntroGate('waiting');
    return () => useStudio.getState().setIntroGate('open');
  }, [sharedView, token]);

  // ---- The Stage ---------------------------------------------------------------------------------
  const waiting = status === 'WaitingForScene';
  const fallbackRef = useMemo(
    () => (!sharedView && projectId && scene.data?.current ? sceneRefFor(source, scene.data.sceneId, scene.data.current.hash) : null),
    [sharedView, source, projectId, scene.data],
  );
  let view: StageView = idleView('studio');
  if (sceneRef) view = { id: 'studio', content: 'studio', scene: sceneRef, control: 'free', dim: 1, durationMs: 900 };
  else if (waiting && fallbackRef) view = { id: 'studio', content: 'scene', scene: fallbackRef, control: 'free', idleOrbit: true, dim: 0.35 };
  useStageView(view);
  useStageRegion(region);

  // ---- Recordings ---------------------------------------------------------------------------------
  const sessions = useSessions(projectId, scene.data?.sceneId, version ? { version: version.version } : null);
  const sessionHref = useCallback((id: string) => `${base}/sessions/${encodeURIComponent(id)}`, [base]);

  // With a session open the share button opens the sharing dialog; on a bare scene it copies the link to this version.
  const share = async () => {
    if (hasSession) {
      setSharing({ time: playback.time });
      return;
    }
    if (!version) return;
    try {
      await navigator.clipboard.writeText(viewLink(window.location.origin, base, version.version));
      notify('Link copied.');
    } catch {
      notify('Could not copy the link.', 'error');
    }
  };

  // ---- Windows -----------------------------------------------------------------------------------
  const name = sharedView ? (shared.data?.sceneName ?? 'Scene') : scene.data ? sceneTitle(scene.data) : 'Scene';
  const sessionLabel = detail ? `${sessionHandle(detail.id)} / ${formatCaptured(detail.createdAtUtc)}` : '';
  const windows: WindowDef[] = useMemo(() => {
    const list: WindowDef[] = sharedView
      ? []
      : [
          {
            id: 'recordings',
            title: 'Recordings',
            icon: ListVideo,
            group: 'recordings',
            description: 'Other recordings of this scene',
            render: () => <RecordingsWindow sessions={sessions.data} version={version?.version ?? null} currentId={sessionId ?? null} sessionHref={sessionHref} />,
          },
        ];
    if (hasSession) {
      list.push(
        {
          id: 'logs',
          title: 'Logs',
          icon: SquareTerminal,
          group: 'recordings',
          description: "The game's console output, in sync with the playhead",
          render: () =>
            replay.data ? (
              <LogsWindow replay={replay.data} playback={playback} label={sessionLabel} />
            ) : (
              <p className="px-6 py-6 text-[14px] text-fg-2">The logs appear once the replay is built.</p>
            ),
        },
        { id: 'details', title: 'Session details', icon: Activity, group: 'recordings', description: 'Recording health and statistics', render: () => (detail ? <DetailsWindow session={detail} replay={replay.data ?? null} /> : null) },
      );
    }
    list.push(
      { id: 'hierarchy', title: 'Hierarchy', icon: Network, group: 'scene', description: 'Every object in the scene', render: () => <HierarchyWindow /> },
      { id: 'inspector', title: 'Inspector', icon: Info, group: 'scene', description: "The selected object's transform and components", render: () => <InspectorWindow /> },
      { id: 'materials', title: 'Materials', icon: Palette, group: 'scene', description: 'Every material, with its properties', render: () => <MaterialsWindow sceneName={name} /> },
      { id: 'textures', title: 'Textures', icon: Image, group: 'scene', description: 'The images the scene uses', render: () => <TexturesWindow /> },
      { id: 'geometry', title: 'Geometry', icon: Box, group: 'scene', description: 'Meshes, triangles and bounds', render: () => <GeometryWindow version={version} /> },
      { id: 'viewpoint', title: 'Viewpoint', icon: Eye, group: 'view', description: 'Cameras to follow and display settings', render: () => <ViewpointWindow scope={scope} playback={playback} /> },
      { id: 'raw', title: 'Raw data', icon: Braces, group: 'view', description: 'The recording as data', render: () => <RawWindow session={detail ?? null} /> },
    );
    // A visitor has only the panels the owner made available; the shortcuts count the ones that are left.
    return list.filter((w) => panelAvailable(shareSettings, w.id)).map((w, i) => ({ ...w, shortcut: i < 10 ? `Alt+${(i + 1) % 10}` : undefined }));
  }, [name, version, scope, detail, sharedView, shareSettings, hasSession, sessionId, replay.data, playback, sessionLabel, sessions.data, sessionHref]);

  useStudioShortcuts({ scope, windows: phone ? [] : windows.map((w) => w.id), playback: replay.data ? playback : null, logs: replay.data?.logs ?? [] });

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useWindowTitle(detail ? `${sessionHandle(detail.id)} · ${name}` : `${name} in 3D`);

  const loaded = Boolean(replay.data) && Boolean(player) && sceneState.status === 'ready';
  // Play before everything is ready keeps the card up ("Starting…"); it closes when ready, and the opened gate starts the intro.
  useEffect(() => {
    if (played && loaded) setWelcomed(true);
  }, [played, loaded]);
  const play = useCallback(() => {
    setPlayed(true);
    // Whatever ?t= said, Play ends in playing (the intro reads this when it starts ungated).
    playback.playing = true;
    // Later than the keydown that pressed it (Esc, Enter): the intro skips on any key, and must not take this one.
    setTimeout(() => useStudio.getState().setIntroGate('open'), 0);
  }, [playback]);

  const error = sharedView ? shared.error : (project.error ?? scene.error ?? session.error);
  const showTimeline = hasSession;
  const timelineHeight = useElementHeight(timelineRef, showTimeline);
  const backHref = version && !version.isCurrent ? `${base}?version=${version.version}` : base;

  const toggleFullscreen = () => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.().catch(() => undefined));
  const tools: RailTool[] = [
    { id: 'debug', label: 'Debug', icon: Bug, description: 'Frame times, memory and caches, with a wireframe switch', active: debugOpen, onClick: () => useStage.getState().setDebugOpen(!debugOpen) },
    { id: 'keys', label: 'Keyboard shortcuts', hint: '?', icon: Keyboard, description: 'Every key and what it does', onClick: () => useStudio.getState().setShortcutsOpen(true) },
  ];

  const showWelcome =
    sharedView && !welcomed && Boolean(shared.data) && shared.data?.session.status === 'Ready' && !error && !replay.isError && sceneState.status !== 'error';

  if (sharedView && shared.error instanceof ApiError && shared.error.status === 404) return <LinkUnavailable signedIn={user !== null} />;

  // The room the chrome takes, so the 3D is centred in what is left and nothing sits on the timeline.
  const edge = phone
    ? { top: 'max(env(safe-area-inset-top), 8px)', right: 'max(env(safe-area-inset-right), 12px)', bottom: 'max(env(safe-area-inset-bottom), 8px)', left: 'max(env(safe-area-inset-left), 12px)' }
    : { top: '16px', right: '16px', bottom: '16px', left: '16px' };
  const barHeight = phone ? 44 : 48;
  const timelineRoom = showTimeline ? timelineHeight + 12 : 0;
  // On a phone the Settings sheet is the one control that is not the view, and the way to share or sign in rides in it.
  const account = sharedView ? (
    !user && (
      <LinkButton to="/login" state={{ from: location.pathname + location.search }} variant="secondary" size="sm">
        Sign in
      </LinkButton>
    )
  ) : (
    (hasSession || version) && (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setSettingsOpen(false);
          void share();
        }}
      >
        <Share className="h-4 w-4" />
        {hasSession ? 'Share this recording' : 'Copy a link'}
      </Button>
    )
  );

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      <div className="relative min-w-0 flex-1">
        <StageSurface className="absolute inset-0 z-0 touch-none" />
        {/* The part of the view the 3D centres in. */}
        <div
          ref={region}
          aria-hidden="true"
          className="pointer-events-none absolute transition-[left,bottom,right,top] duration-[420ms] ease-[var(--ease-out-soft)]"
          style={{
            left: 0,
            right: phone ? 0 : 84,
            top: `calc(${edge.top} + ${barHeight + 8}px)`,
            bottom: `calc(${edge.bottom} + ${showTimeline ? timelineRoom : 8}px)`,
          }}
        />
        <StageNotice />

        <div className="pointer-events-none absolute inset-0 z-10" style={{ padding: `${edge.top} ${edge.right} ${edge.bottom} ${edge.left}` }}>
          <div className="relative h-full">
            {/* The top bar: where you are, then the view's buttons. Laid out in one row so the two can never overlap. */}
            <div className="absolute inset-x-0 top-0 flex items-start gap-3">
              {(() => {
                const cardClass = cn('glass group pointer-events-auto flex min-w-0 max-w-[320px] flex-1 items-center gap-3 rounded-[10px] border border-rule-strong/60 px-3.5', phone ? 'h-11' : 'h-12');
                const label = (
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium leading-5 text-fg" title={name}>
                      {name}
                    </span>
                    <span className="block truncate text-[12px] leading-4 text-fg-3">
                      {detail ? (
                        <>
                          {sharedView && <>{shared.data?.projectName} · </>}
                          <span className="font-mono text-accent">{sessionHandle(detail.id)}</span> · {formatCaptured(detail.createdAtUtc)}
                        </>
                      ) : (
                        <>
                          {project.data?.name ?? '…'} · {version ? versionLabel(version.version) : '…'}
                          {version && !version.isCurrent && ' · archived'}
                        </>
                      )}
                    </span>
                  </span>
                );
                return sharedView ? (
                  <div className={cardClass}>{label}</div>
                ) : (
                  <Link to={backHref} className={cn(cardClass, 'transition-colors hover:border-fg-3/60')}>
                    <ArrowLeft className="h-5 w-5 shrink-0 text-fg transition-transform group-hover:-translate-x-0.5" />
                    {label}
                  </Link>
                );
              })()}

              <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-2">
                {phone ? (
                  <IconButton label="Settings" aria-expanded={settingsOpen} active={settingsOpen} className="glass h-11 w-11 border border-rule-strong/60" onClick={() => setSettingsOpen((o) => !o)}>
                    <SlidersHorizontal className="h-5 w-5" strokeWidth={1.6} />
                  </IconButton>
                ) : (
                  <>
                    <IconButton label={fullscreen ? 'Leave full screen' : 'Full screen'} className="glass h-10 w-10 border border-rule-strong/60" onClick={toggleFullscreen}>
                      {fullscreen ? <Shrink className="h-5 w-5" strokeWidth={1.6} /> : <Expand className="h-5 w-5" strokeWidth={1.6} />}
                    </IconButton>
                    {sharedView ? (
                      !user && (
                        <LinkButton to="/login" state={{ from: location.pathname + location.search }} variant="secondary" className="glass h-10 border-rule-strong/60">
                          Sign in
                        </LinkButton>
                      )
                    ) : (
                      (hasSession || version) && (
                        <IconButton label={hasSession ? 'Share this recording' : 'Copy a link'} className="glass h-10 w-10 border border-rule-strong/60" onClick={() => void share()}>
                          <Share className="h-5 w-5" strokeWidth={1.6} />
                        </IconButton>
                      )
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Right: the tools, centred beside the view, down to the bottom edge; too many for a short screen, they scroll. A phone has none. */}
            {!phone && (
              <div className="pointer-events-none absolute bottom-0 right-0 top-14 z-20 flex items-center justify-end">
                <WindowRail scope={scope} windows={windows} tools={tools} />
              </div>
            )}

            {/* States the scene or session can be in. */}
            <CentreState
              error={error ?? replay.error ?? null}
              sceneError={sceneState.status === 'error' && view.content !== 'none' ? sceneState.error : null}
              session={detail ?? null}
              readOnly={sharedView}
              noVersion={Boolean(scene.data && !version && !hasSession)}
              onRetry={() => {
                void session.refetch();
                void shared.refetch();
                void replay.refetch();
                useStage.getState().retryScene();
              }}
            />

            <SelectionCard bottom={timelineRoom} />

            {hasSession && (
              // Beside the rail, never under it.
              <div ref={timelineRef} className={cn('pointer-events-auto absolute bottom-0 left-0', phone ? 'right-0' : 'right-[68px]')}>
                <Timeline playback={playback} replay={replay.data ?? null} disabled={!replay.data || sceneState.status !== 'ready'} row={phone && landscape} />
              </div>
            )}
          </div>
        </div>

        {!phone && (
          <div className="pointer-events-none absolute inset-0 z-20">
            <div className="absolute inset-0" style={{ bottom: showTimeline ? timelineHeight + 24 : 16, top: 0 }}>
              <FloatingWindows scope={scope} windows={windows} />
            </div>
          </div>
        )}
      </div>

      {!phone && <WindowDock scope={scope} windows={windows} />}
      {debugOpen && (
        <Suspense fallback={null}>
          <DebugWindow />
        </Suspense>
      )}
      <ShortcutsDialog playback={hasSession} windowCount={phone ? 0 : windows.length} />
      {showWelcome && shared.data && (
        <WelcomeCard
          shared={shared.data}
          startTime={startTime}
          ready={loaded}
          replayLoaded={Boolean(replay.data)}
          starting={played}
          onPlay={play}
          windows={windows}
          tools={tools}
          phone={phone}
        />
      )}
      {phone && (
        <PhoneSettings
          open={settingsOpen && !showWelcome}
          onOpenChange={setSettingsOpen}
          playback={playback}
          replay={replay.data ?? null}
          logsAvailable={hasSession && windows.some((w) => w.id === 'logs')}
          actions={account || undefined}
        />
      )}
      {sharing && session.data && !sharedView && <ShareDialog target={session.data} time={sharing.time} onClose={() => setSharing(null)} />}
    </div>
  );
}
/** Bottom left, above the timeline: the selected object, while there is one. */
function SelectionCard({ bottom }: { bottom: number }) {
  const selected = useStudio((s) => s.selected);
  const selectedId = useStudio((s) => s.selectedId);
  const follow = useStudio((s) => s.follow);
  const player = useStudio((s) => s.player);
  // Following the selection leaves the focused camera, which a locked target keeps.
  const targetLocked = useLocked('cameraTarget');

  if (!selected) return null;
  return (
    <div className="glass pointer-events-auto absolute left-0 flex max-w-[min(440px,calc(100%-84px))] animate-rise items-center gap-3 rounded-[10px] border border-accent/30 py-2 pl-4 pr-1.5" style={{ bottom }}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
      <button type="button" className="min-w-0 text-left" onClick={() => useStudio.getState().frameSelected()} title="Frame it (Shift+F)">
        <span className="block truncate text-[14px] text-fg">{selected.name || (selectedId !== null && player ? player.nameOf(selectedId) : 'Selection')}</span>
        <span className="block truncate font-mono text-[11px] text-fg-3">{selectedId !== null ? `#${selectedId}` : 'not tracked'}</span>
      </button>
      {player && !targetLocked && (
        <IconButton label={follow ? 'Stop following' : 'Follow'} shortcut="F" size="sm" active={follow} onClick={() => useStudio.getState().setFollow(!follow)}>
          <Crosshair className="h-4 w-4" />
        </IconButton>
      )}
      <IconButton label="Clear selection" shortcut="Esc" size="sm" onClick={() => useStudio.getState().select(null)}>
        <X className="h-4 w-4" />
      </IconButton>
    </div>
  );
}
function CentreState({
  error,
  sceneError,
  session,
  readOnly,
  noVersion,
  onRetry,
}: {
  error: unknown;
  sceneError: unknown;
  session: SharedSessionDetail | null;
  /** A shared view: nothing to fix or rebuild from here. */
  readOnly: boolean;
  noVersion: boolean;
  onRetry: () => void;
}) {
  const recompile = useRecompileSession();
  const notify = useToast();

  let card: React.ReactNode = null;
  if (error) card = <ErrorState error={error} title="This did not load" onRetry={onRetry} className="max-w-lg" />;
  else if (sceneError) card = <ErrorState error={sceneError} title="The scene did not load" onRetry={() => useStage.getState().retryScene()} className="max-w-lg" />;
  else if (noVersion) card = <StateCard icon={<Hourglass className="h-5 w-5 text-wait" />} title="This scene has no version to show" body="Export it from Unity with MoodyBlues > Export This Scene." />;
  else if (session && session.status !== 'Ready') {
    switch (session.status) {
      case 'Recording':
        card = (
          <StateCard
            icon={<span className="h-3 w-3 animate-pulse-live rounded-full bg-live" />}
            title="This session is still being recorded"
            body={<>The replay is built when it ends. Last data arrived {formatAgo(session.lastActivityUtc)}.</>}
          />
        );
        break;
      case 'Queued':
      case 'Compiling':
        card = <StateCard icon={<RotateCw className="h-5 w-5 animate-spin text-work [animation-duration:2.4s]" />} title="Building the replay" body="The recorded events are being turned into animation. This page updates by itself." working />;
        break;
      case 'WaitingForScene':
        card = (
          <StateCard
            icon={<Hourglass className="h-5 w-5 text-wait" />}
            title="Waiting for its scene"
            body={
              <>
                This session was recorded in a version of the scene that was never uploaded. Export it from Unity with <span className="text-fg">MoodyBlues &gt; Export This Scene</span> and
                the replay is built automatically.
                <span className="mt-3 block break-all font-mono text-[11px] text-fg-3">Scene version {session.sceneHash}</span>
              </>
            }
          />
        );
        break;
      case 'Failed':
        card = (
          <StateCard
            icon={<TriangleAlert className="h-5 w-5 text-danger" />}
            title="The replay could not be built"
            body={session.errorMessage ?? 'The server did not say why.'}
            action={
              readOnly ? undefined : (
              <Button
                variant="secondary"
                loading={recompile.isPending}
                onClick={async () => {
                  try {
                    await recompile.mutateAsync(session.id);
                  } catch (err) {
                    notify(errorText(err), 'error');
                  }
                }}
              >
                <RotateCw className="h-4 w-4" />
                Rebuild replay
              </Button>
              )
            }
          />
        );
        break;
    }
  }
  if (!card) return null;
  return <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 [&>*]:pointer-events-auto">{card}</div>;
}

function StateCard({ icon, title, body, action, working }: { icon: React.ReactNode; title: string; body: React.ReactNode; action?: React.ReactNode; working?: boolean }) {
  return (
    <div className="glass elevated w-full max-w-md animate-rise rounded-[14px] border border-rule-strong/60 p-7 text-center">
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-ink-4">{icon}</div>
      <p className="display text-[22px] leading-7 text-fg">{title}</p>
      <div className="mt-2.5 text-[14px] leading-6 text-fg-2">{body}</div>
      {working && <div className="sweep mx-auto mt-6 h-[3px] w-48 rounded-full bg-ink-4" />}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** The share link is private, reset, deleted or mistyped; the server answers all of those the same way. */
function LinkUnavailable({ signedIn }: { signedIn: boolean }) {
  useWindowTitle('Link not available');
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <StateCard
        icon={<TriangleAlert className="h-5 w-5 text-caution" />}
        title="This link is not available"
        body="It may have been made private, reset or deleted by its owner, or the address is incomplete. Ask whoever sent it for a new link."
        action={
          <LinkButton to={signedIn ? '/projects' : '/login'} variant="secondary">
            {signedIn ? 'Go to your projects' : 'Sign in'}
          </LinkButton>
        }
      />
    </div>
  );
}
