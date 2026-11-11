import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  Box,
  Braces,
  Crosshair,
  Expand,
  Focus,
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
import { downloadWithProgress, useProject, useRecompileSession, useScene, useSession, useSessions } from '../api/queries';
import { errorText } from '../api/client';
import type { SceneVersion, SessionDetail } from '../api/types';
import { parseReplay } from '../viewer/replay/replayFile';
import { computeGlyphTimeline } from '../viewer/replay/glyphTimeline';
import { useReplayBinding } from '../player/binding';
import { Playback } from '../player/playback';
import { saveGlyph } from '../pages/scene/glyphs';
import { StageNotice } from '../stage/StageNotice';
import { StageSurface } from '../stage/StageSurface';
import { useStage, type StageView } from '../stage/store';
import { useStageRegion } from '../stage/useStageInset';
import { useStageView } from '../stage/useStageView';
import { Button, IconButton } from '../ui/Button';
import { SessionStatusLabel, versionLabel } from '../ui/Chip';
import { Mark } from '../ui/Logo';
import { ErrorState } from '../ui/States';
import { useToast } from '../ui/Toast';
import { cn } from '../ui/cn';
import { formatAgo, formatCaptured, formatCompact, formatCount, formatDuration, sceneTitle, sessionHandle } from '../lib/format';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useWindowTitle } from '../lib/useWindowTitle';
import { CinemaButton, RecordingsDrawer } from './Cinema';
import { ShortcutsDialog, useStudioShortcuts } from './shortcuts';
import { useStudio } from './studioStore';
import { Timeline } from './Timeline';
import { DetailsWindow } from './windows/DetailsWindow';
import { EventsWindow } from './windows/EventsWindow';
import { GeometryWindow } from './windows/GeometryWindow';
import { HierarchyWindow } from './windows/HierarchyWindow';
import { InspectorWindow } from './windows/InspectorWindow';
import { MaterialsWindow } from './windows/MaterialsWindow';
import { RawWindow } from './windows/RawWindow';
import { TexturesWindow } from './windows/TexturesWindow';
import { ViewSettingsWindow } from './windows/ViewSettingsWindow';
import { FloatingWindows, WindowDock, WindowRail, type WindowDef } from './windows/WindowHost';
import { isShown } from './windows/windowLayout';
import { useWindowLayout, windowActions } from './windows/windowStore';

const IDLE: StageView = { id: 'studio', content: 'none', dim: 0 };

/**
 * The 3D studio: one scene version in the persistent Stage with the tool windows over it, and, in
 * Cinema, its recordings, a timeline and the events of the session being watched.
 *
 * `/scenes/:sceneId/view?version=N[&cinema]` inspects a version; `/scenes/:sceneId/sessions/:id?t=`
 * plays a session (always in Cinema). Both are this page, so moving between them is a camera move
 * over the same loaded scene, never a reload.
 */
export default function StudioPage() {
  const { projectId, sceneId, sessionId } = useParams<{ projectId: string; sceneId: string; sessionId?: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const notify = useToast();
  const phone = useMediaQuery('(max-width: 767px)');
  const project = useProject(projectId);
  const scene = useScene(project.data?.developerId, sceneId);
  const session = useSession(sessionId);
  const [playback] = useState(() => new Playback());
  const sceneState = useStage((s) => s.scene);
  const region = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const base = `/projects/${projectId}/scenes/${encodeURIComponent(sceneId ?? '')}`;
  const scope = sessionId ? 'session' : 'scene';
  const cinema = Boolean(sessionId) || params.has('cinema');

  // ---- Which scene version is on screen ------------------------------------------------------
  const versions = useMemo(() => (scene.data ? [scene.data.current, ...scene.data.archived].filter((v): v is SceneVersion => v !== null) : []), [scene.data]);
  const requested = Number(params.get('version'));
  const sessionVersion = session.data ? (versions.find((v) => v.hash === session.data.sceneHash) ?? null) : null;
  const version: SceneVersion | null = sessionId ? sessionVersion : (versions.find((v) => v.version === requested) ?? scene.data?.current ?? null);
  const developerId = project.data?.developerId;
  const sceneRef = useMemo(
    () => (developerId && sceneId && version ? { developerId, sceneId: scene.data?.sceneId ?? sceneId, hash: version.hash } : null),
    [developerId, sceneId, version, scene.data?.sceneId],
  );

  // ---- The replay -------------------------------------------------------------------------------
  const status = session.data?.status;
  const ready = status === 'Ready';
  const replay = useQuery({
    queryKey: ['replay', sessionId, session.data?.compiledAtUtc],
    enabled: Boolean(sessionId && ready),
    staleTime: Infinity,
    gcTime: 60_000,
    queryFn: async ({ signal }) => {
      const buffer = await downloadWithProgress(
        `/api/sessions/${encodeURIComponent(sessionId!)}/replay`,
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
    useReplayBinding.getState().bind(replay.data && sessionId ? replay.data : null, replay.data && sessionId ? playback : null);
    return () => useReplayBinding.getState().bind(null, null);
  }, [replay.data, playback, sessionId]);

  // A replay read here gives its session a true timeline glyph in the lists.
  const detail = session.data;
  useEffect(() => {
    if (replay.data && detail) void saveGlyph({ id: detail.id, replaySizeBytes: detail.replaySizeBytes, keyframeCount: detail.keyframeCount }, computeGlyphTimeline(replay.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay.data, detail?.id]);

  // Start at ?t= (a shared link), once per session.
  useEffect(() => {
    const t = Number(params.get('t'));
    playback.time = Number.isFinite(t) && t > 0 ? t : 0;
    playback.playing = !(Number.isFinite(t) && t > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // ---- The Stage ---------------------------------------------------------------------------------
  const waiting = status === 'WaitingForScene';
  const fallbackRef = useMemo(
    () => (developerId && scene.data?.current ? { developerId, sceneId: scene.data.sceneId, hash: scene.data.current.hash } : null),
    [developerId, scene.data],
  );
  let view: StageView = IDLE;
  if (sceneRef) view = { id: 'studio', content: 'studio', scene: sceneRef, control: 'free', dim: 1, durationMs: 900 };
  else if (waiting && fallbackRef) view = { id: 'studio', content: 'scene', scene: fallbackRef, control: 'free', idleOrbit: true, dim: 0.35 };
  useStageView(view);
  useStageRegion(region);

  // ---- Cinema -------------------------------------------------------------------------------------
  const sessions = useSessions(developerId, scene.data?.sceneId, version ? { version: version.version } : null);
  const [drawer, setDrawer] = useState(!sessionId);
  useEffect(() => setDrawer(cinema && !sessionId), [cinema, sessionId]);
  const recordingsOpen = cinema && drawer;
  const sessionHref = useCallback((id: string) => `${base}/sessions/${encodeURIComponent(id)}`, [base]);

  const toggleCinema = useCallback(() => {
    const v = version?.version;
    if (sessionId) navigate(`${base}/view${v !== undefined && !version?.isCurrent ? `?version=${v}` : ''}`);
    else if (params.has('cinema')) {
      const next = new URLSearchParams(params);
      next.delete('cinema');
      setParams(next, { replace: true });
    } else {
      const next = new URLSearchParams(params);
      next.set('cinema', '1');
      setParams(next, { replace: true });
    }
  }, [sessionId, navigate, base, version, params, setParams]);

  const share = async () => {
    const url = new URL(window.location.href);
    if (sessionId) url.searchParams.set('t', playback.time.toFixed(2));
    try {
      await navigator.clipboard.writeText(url.toString());
      notify(sessionId ? 'Link to this moment copied.' : 'Link copied.');
    } catch {
      notify('Could not copy the link.', 'error');
    }
  };

  // ---- Windows -----------------------------------------------------------------------------------
  const name = scene.data ? sceneTitle(scene.data) : 'Scene';
  const sessionLabel = detail ? `${sessionHandle(detail.id)} / ${formatCaptured(detail.createdAtUtc)}` : '';
  const windows: WindowDef[] = useMemo(() => {
    const list: WindowDef[] = [
      { id: 'hierarchy', title: 'Hierarchy', icon: Network, group: 'scene', render: () => <HierarchyWindow /> },
      { id: 'inspector', title: 'Inspector', icon: Info, group: 'scene', render: () => <InspectorWindow /> },
      { id: 'materials', title: 'Materials', icon: Palette, group: 'scene', render: () => <MaterialsWindow sceneName={name} /> },
      { id: 'textures', title: 'Textures', icon: Image, group: 'scene', render: () => <TexturesWindow /> },
      { id: 'geometry', title: 'Geometry', icon: Box, group: 'scene', render: () => <GeometryWindow version={version} /> },
      { id: 'view', title: 'View settings', icon: SlidersHorizontal, group: 'scene', render: () => <ViewSettingsWindow scope={scope} /> },
      { id: 'raw', title: 'Raw data', icon: Braces, group: 'scene', render: () => <RawWindow session={detail ?? null} /> },
    ];
    if (sessionId) {
      list.push(
        {
          id: 'events',
          title: 'Events & logs',
          icon: SquareTerminal,
          group: 'session',
          render: () =>
            replay.data ? (
              <EventsWindow replay={replay.data} playback={playback} label={sessionLabel} />
            ) : (
              <p className="px-6 py-6 text-[14px] text-fg-2">The events appear once the replay is built.</p>
            ),
        },
        { id: 'details', title: 'Session details', icon: Activity, group: 'session', render: () => (detail ? <DetailsWindow session={detail} replay={replay.data ?? null} sceneHref={base} /> : null) },
      );
    }
    return list.map((w, i) => ({ ...w, shortcut: `Alt+${i + 1}` }));
  }, [name, version, scope, detail, sessionId, replay.data, playback, sessionLabel, base]);
  const layout = useWindowLayout(scope, windows.map((w) => w.id));
  const logsOpen = isShown(layout, 'events');

  useStudioShortcuts({ scope, windows: windows.map((w) => w.id), playback: replay.data ? playback : null, logs: replay.data?.logs ?? [], onCinema: toggleCinema });

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useWindowTitle(detail ? `${sessionHandle(detail.id)} · ${name}` : `${name} in 3D`);

  const error = project.error ?? scene.error ?? session.error;
  const live = (sessions.data ?? []).some((s) => s.status === 'Recording');
  const showTimeline = cinema;
  const backHref = version && !version.isCurrent ? `${base}/history` : base;

  return (
    <div className="fixed inset-0 flex overflow-hidden">
      <div className="relative min-w-0 flex-1">
        <StageSurface className="absolute inset-0 z-0 touch-none" />
        {/* The part of the view the 3D centres in: it moves as Cinema's panels come and go, and the camera glides with it. */}
        <div
          ref={region}
          aria-hidden="true"
          className="pointer-events-none absolute transition-[left,bottom,right,top] duration-[420ms] ease-[var(--ease-out-soft)]"
          style={{ left: recordingsOpen && !phone ? 416 : 0, right: phone ? 0 : 88, top: phone ? 120 : 88, bottom: showTimeline ? (phone ? 200 : 172) : phone ? 120 : 64 }}
        />
        <StageNotice />

        <div className="pointer-events-none absolute inset-0 z-10 p-4 sm:p-6">
          {/* Top left: where you are. */}
          <div className="pointer-events-auto absolute left-4 top-4 flex w-[min(320px,calc(100%-32px))] flex-col gap-2 sm:left-6 sm:top-6">
            <Link to={backHref} className="glass group flex h-[60px] items-center gap-4 rounded-[10px] border border-rule-strong/60 px-4 transition-colors hover:border-fg-3/60">
              <ArrowLeft className="h-5 w-5 shrink-0 text-fg transition-transform group-hover:-translate-x-0.5" />
              <span className="min-w-0">
                <span className="block truncate text-[16px] font-medium leading-5 text-fg">{name}</span>
                <span className="mt-1 block truncate font-mono text-[12px] text-fg-3">
                  {project.data?.name ?? '…'} <span className="mx-1 opacity-60">/</span> {version ? versionLabel(version.version) : '…'}
                  {version && !version.isCurrent && ' · archived'}
                </span>
              </span>
            </Link>
            {detail && !recordingsOpen && <SessionCard session={detail} onRecordings={() => setDrawer(true)} onClose={() => navigate(`${base}/view?${version && !version.isCurrent ? `version=${version.version}&` : ''}cinema=1`)} />}
          </div>

          {/* Top centre: Cinema. */}
          <div className="absolute left-1/2 top-4 -translate-x-1/2 max-sm:top-[172px] sm:top-6">
            <CinemaButton active={cinema} count={sessions.data?.length ?? null} live={live} onToggle={toggleCinema} />
          </div>

          {/* Top right. */}
          <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-2 sm:right-6 sm:top-6">
            <IconButton label="Keyboard shortcuts" shortcut="?" className="glass h-12 w-12 border border-rule-strong/60 max-sm:hidden" onClick={() => useStudio.getState().setShortcutsOpen(true)}>
              <Keyboard className="h-5 w-5" strokeWidth={1.6} />
            </IconButton>
            <IconButton label={sessionId ? 'Copy a link to this moment' : 'Copy a link'} className="glass h-12 w-12 border border-rule-strong/60" onClick={() => void share()}>
              <Share className="h-5 w-5" strokeWidth={1.6} />
            </IconButton>
          </div>

          {/* Left: the recordings, in Cinema. */}
          <div className="absolute bottom-[184px] left-4 top-[96px] w-0 sm:left-6 sm:top-[100px]">
            <RecordingsDrawer
              open={recordingsOpen}
              sessions={sessions.data}
              version={version?.version ?? null}
              sceneName={name}
              currentId={sessionId ?? null}
              sessionHref={sessionHref}
              historyHref={`${base}/history`}
              onClose={() => setDrawer(false)}
            />
          </div>

          {/* Right: the tools. */}
          <div
            className={cn('pointer-events-none absolute z-20', phone ? 'inset-x-4 flex justify-center' : 'right-6 top-1/2 -translate-y-1/2')}
            style={phone ? { bottom: showTimeline ? 196 : 64 } : undefined}
          >
            <WindowRail scope={scope} windows={windows} />
          </div>

          {/* States the scene or session can be in. */}
          <CentreState
            error={error ?? replay.error ?? null}
            sceneError={sceneState.status === 'error' && view.content !== 'none' ? sceneState.error : null}
            session={detail ?? null}
            noVersion={Boolean(scene.data && !version && !sessionId)}
            onRetry={() => {
              void session.refetch();
              void replay.refetch();
              useStage.getState().retryScene();
            }}
          />

          {/* Bottom: what is selected, the timeline, and the footer. */}
          <BottomLeft cinema={Boolean(sessionId)} name={name} timelineShown={showTimeline} />
          <div className="pointer-events-auto absolute bottom-[60px] right-4 flex gap-2 sm:right-6" style={{ bottom: showTimeline ? 188 : 60 }}>
            <IconButton label="Frame the whole scene" shortcut="A" className="glass h-12 w-12 border border-rule-strong/60" onClick={() => useStudio.getState().frameAll()}>
              <Focus className="h-5 w-5" strokeWidth={1.6} />
            </IconButton>
            <IconButton
              label={fullscreen ? 'Leave full screen' : 'Full screen'}
              className="glass h-12 w-12 border border-rule-strong/60 max-sm:hidden"
              onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.().catch(() => undefined))}
            >
              {fullscreen ? <Shrink className="h-5 w-5" strokeWidth={1.6} /> : <Expand className="h-5 w-5" strokeWidth={1.6} />}
            </IconButton>
          </div>

          <div
            className={cn(
              'pointer-events-auto absolute inset-x-4 bottom-[56px] transition-[transform,opacity] duration-[460ms] ease-[var(--ease-out-soft)] sm:inset-x-6',
              showTimeline ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-[calc(100%+80px)] opacity-0',
            )}
            aria-hidden={!showTimeline}
          >
            {sessionId ? (
              <Timeline
                playback={playback}
                replay={replay.data ?? null}
                disabled={!replay.data || sceneState.status !== 'ready'}
                logsOpen={logsOpen}
                onToggleLogs={() => windowActions('session').toggle('events')}
                onShare={() => void share()}
              />
            ) : (
              <div className="glass elevated flex h-[108px] items-center justify-between gap-6 rounded-[12px] border border-rule-strong/60 px-6">
                <div className="flex items-center gap-4">
                  <ListVideo className="h-6 w-6 text-accent" strokeWidth={1.5} />
                  <div>
                    <p className="text-[16px] text-fg">Choose a recording to watch it here.</p>
                    <p className="text-[13px] text-fg-3">Every session recorded against {version ? versionLabel(version.version) : 'this version'} plays on this scene.</p>
                  </div>
                </div>
                {!recordingsOpen && (
                  <Button variant="secondary" onClick={() => setDrawer(true)}>
                    Show recordings
                  </Button>
                )}
              </div>
            )}
          </div>

          <footer className="pointer-events-auto absolute inset-x-4 bottom-3 flex h-8 items-center gap-6 sm:inset-x-6 sm:bottom-4">
            <Link to="/projects" aria-label="MoodyBlues home">
              <Mark className="text-[26px]" live={live} />
            </Link>
            <p className="hidden truncate font-mono text-[12px] text-fg-3 md:block">
              Drag to orbit <span className="mx-2.5 opacity-50">·</span> Shift + drag to pan <span className="mx-2.5 opacity-50">·</span> Scroll to zoom
            </p>
          </footer>
        </div>

        <div className="pointer-events-none absolute inset-0 z-20">
          <div className="absolute inset-0" style={{ bottom: showTimeline ? 176 : 56, top: 0 }}>
            <FloatingWindows scope={scope} windows={windows} />
          </div>
        </div>
      </div>

      <WindowDock scope={scope} windows={windows} />
      <ShortcutsDialog playback={Boolean(sessionId)} />
    </div>
  );
}

function SessionCard({ session, onRecordings, onClose }: { session: SessionDetail; onRecordings: () => void; onClose: () => void }) {
  return (
    <div className="glass flex animate-rise items-center gap-3 rounded-[10px] border border-rule-strong/60 py-2.5 pl-4 pr-1.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] text-fg">
          <span className="font-mono text-[13px] text-accent">{sessionHandle(session.id)}</span> <span className="mx-1 text-fg-3">/</span> {formatCaptured(session.createdAtUtc)}
        </p>
        <p className="mt-0.5 flex items-center gap-2.5 text-[13px] text-fg-3">
          <SessionStatusLabel status={session.status} />
          {session.durationSeconds > 0 && <span className="font-mono text-[12px]">{formatDuration(session.durationSeconds)}</span>}
        </p>
      </div>
      <IconButton label="All recordings" size="sm" onClick={onRecordings}>
        <ListVideo className="h-[18px] w-[18px]" strokeWidth={1.6} />
      </IconButton>
      <IconButton label="Close this recording" size="sm" onClick={onClose}>
        <X className="h-[18px] w-[18px]" />
      </IconButton>
    </div>
  );
}

/** Bottom left: the selected object while there is one, else the scene's name and size. */
function BottomLeft({ cinema, name, timelineShown }: { cinema: boolean; name: string; timelineShown: boolean }) {
  const selected = useStudio((s) => s.selected);
  const selectedId = useStudio((s) => s.selectedId);
  const follow = useStudio((s) => s.follow);
  const player = useStudio((s) => s.player);
  const ref = useStage((s) => s.view.scene);
  const summary = useStage((s) => (ref ? s.summaries[`${ref.developerId}/${ref.sceneId}/${ref.hash}`] : undefined));
  const bottom = timelineShown ? 186 : 58;

  if (selected) {
    return (
      <div className="glass pointer-events-auto absolute left-4 flex max-w-[min(440px,calc(100%-160px))] animate-rise items-center gap-3 rounded-[10px] border border-accent/30 py-2 pl-4 pr-1.5 sm:left-6" style={{ bottom }}>
        <span className="h-2 w-2 shrink-0 rounded-full bg-accent shadow-[0_0_10px_rgb(245_181_68/0.8)]" />
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

  if (cinema) {
    return (
      <p className="pointer-events-none absolute left-4 hidden font-mono text-[12px] text-fg-3 sm:left-6 md:block" style={{ bottom: bottom + 4 }}>
        Events are marked on the timeline. Open logs for detail.
      </p>
    );
  }

  return (
    <div className="pointer-events-none absolute left-4 sm:left-6" style={{ bottom }}>
      <p className="eyebrow text-fg">{name}</p>
      <p className="mt-1.5 font-mono text-[12px] text-fg-3">
        {summary ? (
          <>
            {formatCount(summary.nodes)} objects <span className="mx-1.5 opacity-60">/</span> {formatCompact(summary.triangles)} triangles
          </>
        ) : (
          'Loading…'
        )}
      </p>
    </div>
  );
}

function CentreState({
  error,
  sceneError,
  session,
  noVersion,
  onRetry,
}: {
  error: unknown;
  sceneError: unknown;
  session: SessionDetail | null;
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
