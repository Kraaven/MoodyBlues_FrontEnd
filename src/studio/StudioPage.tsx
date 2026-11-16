import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  SquareTerminal,
  TriangleAlert,
  X,
} from 'lucide-react';
import { downloadWithProgress, useProject, useRecompileSession, useScene, useSession, useSessions, useSharedSession } from '../api/queries';
import { ApiError, errorText } from '../api/client';
import { useAuth } from '../auth/useAuth';
import { usePrefetchFocus } from '../prefetch/usePrefetchFocus';
import type { SceneVersion, SessionDetail } from '../api/types';
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
import { useMediaQuery } from '../lib/useMediaQuery';
import { ShareDialog } from '../share/ShareDialog';
import { WelcomeCard } from '../share/WelcomeCard';
import { replayPath, sceneRef as sceneRefFor, type StudioSource } from './source';
import { useWindowTitle } from '../lib/useWindowTitle';
import { ShortcutsDialog, useStudioShortcuts } from './shortcuts';
import { useStudio } from './studioStore';
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
  const phone = useMediaQuery('(max-width: 767px)');
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
  const [sharing, setSharing] = useState<{ time: number | null } | null>(null);
  // The welcome card of a shared link: Play was pressed, and the card has gone.
  const [played, setPlayed] = useState(false);
  const [welcomed, setWelcomed] = useState(false);
  const player = useStudio((s) => s.player);
  const debugOpen = useStage((s) => s.debugOpen);

  const base = `/projects/${projectId}/scenes/${encodeURIComponent(sceneId ?? '')}`;
  const detail = sharedView ? shared.data?.session : session.data;
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

  // Start at ?t= (a shared link), once per session.
  useEffect(() => {
    const t = parseStartTime(params.get('t'));
    playback.time = t;
    playback.playing = t === 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayUrl]);

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
        { id: 'details', title: 'Session details', icon: Activity, group: 'recordings', description: 'Recording health and statistics', render: () => (detail ? <DetailsWindow session={detail} replay={replay.data ?? null} sceneHref={sharedView ? null : base} /> : null) },
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
    return list.map((w, i) => ({ ...w, shortcut: i < 10 ? `Alt+${(i + 1) % 10}` : undefined }));
  }, [name, version, scope, detail, sharedView, hasSession, sessionId, replay.data, playback, sessionLabel, base, sessions.data, sessionHref]);

  useStudioShortcuts({ scope, windows: windows.map((w) => w.id), playback: replay.data ? playback : null, logs: replay.data?.logs ?? [] });

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
  const backHref = version && !version.isCurrent ? `${base}?version=${version.version}` : base;

  const toggleFullscreen = () => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.().catch(() => undefined));
  const tools: RailTool[] = phone
    ? []
    : [
        { id: 'debug', label: 'Debug', icon: Bug, description: 'Frame times, memory and caches, with a wireframe switch', active: debugOpen, onClick: () => useStage.getState().setDebugOpen(!debugOpen) },
        { id: 'keys', label: 'Keyboard shortcuts', hint: '?', icon: Keyboard, description: 'Every key and what it does', onClick: () => useStudio.getState().setShortcutsOpen(true) },
      ];

  const showWelcome =
    sharedView && !welcomed && Boolean(shared.data) && shared.data?.session.status === 'Ready' && !error && !replay.isError && sceneState.status !== 'error';

  if (sharedView && shared.error instanceof ApiError && shared.error.status === 404) return <LinkUnavailable signedIn={user !== null} />;

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      <div className="relative min-w-0 flex-1">
        <StageSurface className="absolute inset-0 z-0 touch-none" />
        {/* The part of the view the 3D centres in. */}
        <div
          ref={region}
          aria-hidden="true"
          className="pointer-events-none absolute transition-[left,bottom,right,top] duration-[420ms] ease-[var(--ease-out-soft)]"
          style={{ left: 0, right: phone ? 0 : 88, top: 72, bottom: showTimeline ? (phone ? 168 : 136) : phone ? 96 : 24 }}
        />
        <StageNotice />

        <div className="pointer-events-none absolute inset-0 z-10 p-4 sm:p-6">
          {/* Top left: where you are, and the way back. */}
          {(() => {
            const cardClass = 'glass group pointer-events-auto absolute left-4 top-4 flex h-14 w-[min(320px,calc(100%-88px))] items-center gap-3.5 rounded-[10px] border border-rule-strong/60 px-4 sm:left-6 sm:top-6';
            const label = (
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium leading-5 text-fg">{name}</span>
                <span className="block truncate text-[12px] text-fg-3">
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

          {/* Top right: full screen, and share, or for a visitor, the way to sign in. */}
          <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-2 sm:right-6 sm:top-6">
            {!phone && (
              <IconButton label={fullscreen ? 'Leave full screen' : 'Full screen'} className="glass h-11 w-11 border border-rule-strong/60" onClick={toggleFullscreen}>
                {fullscreen ? <Shrink className="h-5 w-5" strokeWidth={1.6} /> : <Expand className="h-5 w-5" strokeWidth={1.6} />}
              </IconButton>
            )}
            {sharedView ? (
              !user && (
                <LinkButton to="/login" state={{ from: location.pathname + location.search }} variant="secondary" className="glass h-11 border-rule-strong/60">
                  Sign in
                </LinkButton>
              )
            ) : (
              (hasSession || version) && (
                <IconButton label={hasSession ? 'Share this recording' : 'Copy a link'} className="glass h-11 w-11 border border-rule-strong/60" onClick={() => void share()}>
                  <Share className="h-5 w-5" strokeWidth={1.6} />
                </IconButton>
              )
            )}
          </div>

          {/* Right: the tools, centred between the top buttons and the timeline; too many for the space, they fill it and scroll. */}
          <div
            className={cn('pointer-events-none absolute z-20', phone ? 'inset-x-4 flex justify-center' : 'right-6 flex items-center justify-end')}
            style={phone ? { bottom: showTimeline ? 176 : 24 } : { top: 80, bottom: showTimeline ? 148 : 24 }}
          >
            <WindowRail scope={scope} windows={windows} tools={tools} />
          </div>

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

          <SelectionCard timelineShown={showTimeline} />

          {hasSession && (
            <div className="pointer-events-auto absolute inset-x-4 bottom-4 sm:inset-x-6">
              <Timeline playback={playback} replay={replay.data ?? null} disabled={!replay.data || sceneState.status !== 'ready'} />
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute inset-0 z-20">
          <div className="absolute inset-0" style={{ bottom: showTimeline ? 136 : 16, top: 0 }}>
            <FloatingWindows scope={scope} windows={windows} />
          </div>
        </div>
      </div>

      <WindowDock scope={scope} windows={windows} />
      {debugOpen && (
        <Suspense fallback={null}>
          <DebugWindow />
        </Suspense>
      )}
      <ShortcutsDialog playback={hasSession} />
      {showWelcome && shared.data && (
        <WelcomeCard
          shared={shared.data}
          startTime={parseStartTime(params.get('t'))}
          ready={loaded}
          replayLoaded={Boolean(replay.data)}
          starting={played}
          onPlay={play}
          windows={windows}
          tools={tools}
          phone={phone}
        />
      )}
      {sharing && detail && !sharedView && <ShareDialog target={detail} time={sharing.time} onClose={() => setSharing(null)} />}
    </div>
  );
}
/** Bottom left: the selected object, while there is one. */
function SelectionCard({ timelineShown }: { timelineShown: boolean }) {
  const selected = useStudio((s) => s.selected);
  const selectedId = useStudio((s) => s.selectedId);
  const follow = useStudio((s) => s.follow);
  const player = useStudio((s) => s.player);
  const bottom = timelineShown ? 148 : 24;

  if (!selected) return null;
  return (
    <div className="glass pointer-events-auto absolute left-4 flex max-w-[min(440px,calc(100%-160px))] animate-rise items-center gap-3 rounded-[10px] border border-accent/30 py-2 pl-4 pr-1.5 sm:left-6" style={{ bottom }}>
      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
      <button type="button" className="min-w-0 text-left" onClick={() => useStudio.getState().frameSelected()} title="Frame it (Shift+F)">
        <span className="block truncate text-[14px] text-fg">{selected.name || (selectedId !== null && player ? player.nameOf(selectedId) : 'Selection')}</span>
        <span className="block truncate font-mono text-[11px] text-fg-3">{selectedId !== null ? `#${selectedId}` : 'not tracked'}</span>
      </button>
      {player && (
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
  session: SessionDetail | null;
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
