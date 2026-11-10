import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Braces,
  Boxes,
  Crosshair,
  Grid3x3,
  Hourglass,
  Keyboard,
  Link2,
  LocateFixed,
  Maximize,
  MoreHorizontal,
  RotateCw,
  ScrollText,
  X,
} from 'lucide-react';
import { downloadWithProgress, useProject, useRecompileSession, useScene, useSession } from '../api/queries';
import { errorText } from '../api/client';
import type { SessionDetail } from '../api/types';
import { parseReplay } from '../viewer/replay/replayFile';
import { DockReveal, FloatingPanels, PanelDock, PanelRail, type PanelDef } from '../panels/PanelHost';
import { panelActions } from '../panels/panelStore';
import { useWindowTitle } from '../lib/useWindowTitle';
import { Chrome } from '../stage/Chrome';
import { StageNotice } from '../stage/StageNotice';
import { StageSurface } from '../stage/StageSurface';
import { useStage, type StageView } from '../stage/store';
import { useStageRegion } from '../stage/useStageInset';
import { useStageView } from '../stage/useStageView';
import { Button, IconButton } from '../ui/Button';
import { SessionStatusChip } from '../ui/Chip';
import { Menu } from '../ui/Menu';
import { ErrorState } from '../ui/States';
import { useToast } from '../ui/Toast';
import { formatAgo, formatDuration, formatRecorded, sceneTitle } from '../lib/format';
import { saveGlyph } from '../pages/scene/glyphs';
import { computeGlyphTimeline } from '../viewer/replay/glyphTimeline';
import { useReplayBinding } from './binding';
import { DetailsTab } from './DetailsTab';
import { LogsTab } from './LogsTab';
import { ObjectsTab } from './ObjectsTab';
import { Playback, usePlayerUi } from './playback';
import { RawTab } from './RawTab';
import { ShortcutsDialog, usePlayerShortcuts } from './shortcuts';
import { Timeline } from './Timeline';
import { unityPath } from './unityPath';

const SCOPE = 'player';

export default function SessionPlayerPage() {
  const { projectId, sceneId, sessionId } = useParams<{ projectId: string; sceneId: string; sessionId: string }>();
  const [params] = useSearchParams();
  const project = useProject(projectId);
  const scene = useScene(project.data?.developerId, sceneId);
  const session = useSession(sessionId);
  const [playback] = useState(() => new Playback());
  const notify = useToast();
  const region = useRef<HTMLDivElement>(null);
  const sceneState = useStage((s) => s.scene);

  const ready = session.data?.status === 'Ready';
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

  // Hand the Stage the parsed replay and its clock.
  useEffect(() => {
    useReplayBinding.getState().bind(replay.data ?? null, playback);
    return () => useReplayBinding.getState().bind(null, null);
  }, [replay.data, playback]);

  // A replay that has been read here gives its session a true timeline glyph in the lists.
  const detail = session.data;
  const glyphId = detail?.id;
  const glyphSize = detail?.replaySizeBytes;
  const glyphKeys = detail?.keyframeCount;
  useEffect(() => {
    if (replay.data && glyphId !== undefined && glyphSize !== undefined && glyphKeys !== undefined) {
      void saveGlyph({ id: glyphId, replaySizeBytes: glyphSize, keyframeCount: glyphKeys }, computeGlyphTimeline(replay.data));
    }
  }, [replay.data, glyphId, glyphSize, glyphKeys]);

  // Start at ?t= (a shared link), once.
  useEffect(() => {
    const t = Number(params.get('t'));
    if (Number.isFinite(t) && t > 0) {
      playback.time = t;
      playback.playing = false;
    }
    return () => usePlayerUi.getState().reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = session.data?.status;
  usePlayerShortcuts(playback, replay.data?.logs ?? [], Boolean(replay.data && sceneState.status === 'ready'));

  // What the Stage shows (DESIGN.md 7.7): the replay once it is parsed; before that the scene itself,
  // so something real is on screen while the replay downloads or is being built.
  const sceneRef = useMemo(
    () => (project.data && session.data ? { developerId: project.data.developerId, sceneId: session.data.sceneId, hash: session.data.sceneHash } : null),
    [project.data, session.data],
  );
  let view: StageView = { id: 'session', content: 'trace', pose: { position: [0, 9, 30], target: [0, -1, 0], fov: 50 }, drift: true, dim: 0.5 };
  if (sceneRef && status === 'Ready' && replay.data && !replay.isError) {
    view = { id: 'session', content: 'replay', scene: sceneRef, control: 'free', dim: 1 };
  } else if (sceneRef && (status === 'Ready' || status === 'Recording' || status === 'Queued' || status === 'Compiling')) {
    view = { id: 'session', content: 'scene', scene: sceneRef, control: 'free', idleOrbit: status !== 'Ready', dim: status === 'Ready' ? 1 : 0.75 };
  }
  useStageView(view);
  useStageRegion(region);

  const base = `/projects/${projectId}/scenes/${encodeURIComponent(sceneId ?? '')}`;
  const title = scene.data ? sceneTitle(scene.data) : 'Scene';
  const sessionLabel = session.data ? `Session · ${formatRecorded(session.data.createdAtUtc)}` : 'Session';
  useWindowTitle(sessionLabel);
  const crumbs = [
    { label: 'Projects', to: '/projects' },
    { label: project.data?.name ?? 'Project', to: `/projects/${projectId}` },
    { label: title, to: base },
    { label: sessionLabel },
  ];

  const copyLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('t', playback.time.toFixed(2));
    try {
      await navigator.clipboard.writeText(url.toString());
      notify('Link to this moment copied.');
    } catch {
      notify('Could not copy the link.', 'error');
    }
  };

  const errors = replay.data?.logs.filter((l) => l.level === 3).length ?? 0;
  const panels: PanelDef[] = useMemo(() => {
    const waiting = (what: string) => <p className="p-4 text-[13px] text-fg-2">{what} appear here once the replay is built.</p>;
    const data = session.data;
    return [
      {
        id: 'logs',
        title: 'Logs',
        icon: ScrollText,
        badge: replay.data ? (errors > 0 ? `${errors} err` : String(replay.data.logs.length)) : undefined,
        shortcut: 'Alt+1',
        render: () => (replay.data ? <LogsTab logs={replay.data.logs} playback={playback} /> : waiting('Logs')),
      },
      {
        id: 'objects',
        title: 'Objects',
        icon: Boxes,
        shortcut: 'Alt+2',
        render: () => (replay.data ? <ObjectsTab playback={playback} /> : waiting('Objects')),
      },
      {
        id: 'details',
        title: 'Details',
        icon: Activity,
        shortcut: 'Alt+3',
        render: () => (data ? <DetailsTab session={data} replay={replay.data ?? null} sceneHref={base} sessionsHref={base} /> : null),
      },
      {
        id: 'raw',
        title: 'Raw data',
        short: 'Raw',
        icon: Braces,
        shortcut: 'Alt+4',
        render: () => (data ? <RawTab session={data} playback={playback} /> : null),
      },
    ];
  }, [replay.data, errors, session.data, playback, base]);

  // Before the replay exists, Details is the only panel with something to show.
  useEffect(() => {
    if (status && status !== 'Ready') panelActions(SCOPE).open('details');
  }, [status]);

  const error = project.error ?? session.error ?? replay.error;
  const chromeTrailing = session.data ? (
    <div className="pointer-events-auto flex min-w-0 items-center gap-2.5">
      <SessionStatusChip status={session.data.status} />
      <span className="tabular hidden truncate font-mono text-[12px] text-fg-3 xl:inline">
        {formatDuration(session.data.durationSeconds)} · {session.data.objectCount} objects
        {session.data.spawnCount > 0 && ` · ${session.data.spawnCount} spawned`}
      </span>
      <IconButton label="Keyboard shortcuts" shortcut="?" size="sm" className="hidden sm:inline-flex" onClick={() => usePlayerUi.getState().setShortcutsOpen(true)}>
        <Keyboard className="h-4 w-4" />
      </IconButton>
      <Menu
        trigger={
          <IconButton label="Session actions" size="sm" tooltip={false}>
            <MoreHorizontal className="h-4 w-4" />
          </IconButton>
        }
        items={[
          { label: 'Copy link to this moment', icon: Link2, onSelect: () => void copyLink() },
          { label: 'Reset panel layout', icon: Grid3x3, onSelect: () => panelActions(SCOPE).reset() },
        ]}
      />
    </div>
  ) : undefined;

  return (
    <div className="flex h-full flex-col">
      <Chrome crumbs={crumbs} variant="line" trailing={chromeTrailing} />
      <main id="main" className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div ref={region} className="relative min-h-0 min-w-0 flex-1">
          <StageSurface className="absolute inset-0 z-0" />
          <StageNotice />
          <PanelRail scope={SCOPE} panels={panels} />
          <DockReveal scope={SCOPE} panels={panels} />
          <FloatingPanels scope={SCOPE} panels={panels} />

          {error ? (
            <CentredCard>
              <ErrorState
                error={error}
                title={replay.error ? 'The replay did not load' : 'This session did not load'}
                onRetry={() => {
                  void session.refetch();
                  void replay.refetch();
                }}
                className="max-w-lg"
              />
            </CentredCard>
          ) : sceneState.status === 'error' && view.content !== 'trace' && status === 'Ready' ? (
            <CentredCard>
              <ErrorState error={sceneState.error} title="The scene did not load" onRetry={() => useStage.getState().retryScene()} className="max-w-lg" />
            </CentredCard>
          ) : session.data && !ready ? (
            <NotReady session={session.data} />
          ) : null}

          {ready && replay.data && sceneState.status === 'ready' && <ViewportOverlays playback={playback} />}
        </div>
        <PanelDock scope={SCOPE} panels={panels} bounds={() => ({ w: region.current?.clientWidth ?? 800, h: region.current?.clientHeight ?? 500 })} />
      </main>
      <Timeline playback={playback} replay={replay.data ?? null} disabled={!replay.data || sceneState.status !== 'ready'} />
      <ShortcutsDialog />
    </div>
  );
}

function CentredCard({ children }: { children: React.ReactNode }) {
  return <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6 [&>*]:pointer-events-auto">{children}</div>;
}

function NotReady({ session }: { session: SessionDetail }) {
  const recompile = useRecompileSession();
  const notify = useToast();

  let icon = <Hourglass className="h-5 w-5 text-blue-bright" />;
  let title = '';
  let body: React.ReactNode = null;
  let action: React.ReactNode = null;

  switch (session.status) {
    case 'Recording':
      icon = <span className="h-3 w-3 animate-pulse-live rounded-full bg-live" />;
      title = 'This session is still being recorded';
      body = <>The replay is built when it ends. Last data arrived {formatAgo(session.lastActivityUtc)}.</>;
      break;
    case 'Queued':
    case 'Compiling':
      title = 'Building the replay…';
      body = 'The recorded events are being turned into animation. This page updates by itself.';
      break;
    case 'WaitingForScene':
      icon = <Hourglass className="h-5 w-5 text-wait" />;
      title = 'Waiting for the scene';
      body = (
        <>
          This session was recorded in a scene version that has not been uploaded. Export it from Unity with{' '}
          <span className="text-fg">MoodyBlues &gt; Export This Scene</span> and the replay is built automatically.
          <span className="mt-3 block break-all font-mono text-[11px] text-fg-3">Scene version hash {session.sceneHash}</span>
        </>
      );
      break;
    case 'Failed':
      icon = <AlertTriangle className="h-5 w-5 text-danger" />;
      title = 'The replay could not be built';
      body = session.errorMessage ?? 'The server did not say why.';
      action = (
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
      );
      break;
    default:
      return null;
  }

  return (
    <CentredCard>
      <div className="glass elevated max-w-md animate-rise rounded-[var(--radius-dialog)] border border-rule p-6 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-rule bg-ink-2">{icon}</div>
        <p className="text-[16px] font-semibold text-fg">{title}</p>
        <div className="mt-2 text-sm text-fg-2">{body}</div>
        {(session.status === 'Queued' || session.status === 'Compiling') && <div className="shimmer mx-auto mt-5 h-1 w-48 rounded-full" />}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </CentredCard>
  );
}

/** View controls (bottom-right) and the selected-object chip (bottom-left). */
function ViewportOverlays({ playback }: { playback: Playback }) {
  const selectedId = usePlayerUi((s) => s.selectedId);
  const follow = usePlayerUi((s) => s.follow);
  const showGrid = usePlayerUi((s) => s.showGrid);
  const ui = usePlayerUi.getState();
  const player = playback.player;
  const node = selectedId !== null ? player?.getObject(selectedId) : undefined;
  const name = selectedId === null ? '' : (player?.nameOf(selectedId) ?? `Object ${selectedId}`);
  const path = player && node ? unityPath(node, player.sceneRoot) : null;

  return (
    <>
      <div className="glass elevated pointer-events-auto absolute bottom-3 right-3 z-10 flex items-center gap-0.5 rounded-[var(--radius-card)] border border-rule p-1">
        <IconButton label="Frame the whole scene" shortcut="A" size="sm" onClick={ui.frameAll}>
          <Maximize className="h-4 w-4" />
        </IconButton>
        <IconButton label="Frame selection" size="sm" disabled={selectedId === null} onClick={ui.frameSelected}>
          <LocateFixed className="h-4 w-4" />
        </IconButton>
        <IconButton label={follow ? 'Stop following' : 'Follow selection'} shortcut="F" size="sm" active={follow} disabled={selectedId === null} onClick={() => ui.setFollow(!follow)}>
          <Crosshair className="h-4 w-4" />
        </IconButton>
        <IconButton label={showGrid ? 'Hide grid' : 'Show grid'} size="sm" active={showGrid} onClick={ui.toggleGrid}>
          <Grid3x3 className="h-4 w-4" />
        </IconButton>
      </div>

      {selectedId !== null && (
        <div className="glass elevated pointer-events-auto absolute bottom-3 left-3 z-10 flex max-w-[min(520px,70%)] animate-rise items-center gap-2 rounded-[var(--radius-card)] border border-rule py-1 pl-3 pr-1">
          <span className="h-2 w-2 shrink-0 rounded-full bg-now shadow-[0_0_8px_rgb(255_181_71/0.8)]" />
          <button type="button" className="min-w-0 text-left" onClick={() => panelActions(SCOPE).open('objects')}>
            <span className="block truncate text-[13px] font-medium text-fg">{name}</span>
            <span className="tabular block truncate font-mono text-[11px] text-fg-3">
              #{selectedId}
              {path && ` · ${path}`}
            </span>
          </button>
          <IconButton label={follow ? 'Stop following' : 'Follow'} shortcut="F" size="sm" active={follow} onClick={() => ui.setFollow(!follow)}>
            <Crosshair className="h-4 w-4" />
          </IconButton>
          <IconButton label="Clear selection" shortcut="Esc" size="sm" onClick={() => ui.select(null)}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      )}
    </>
  );
}
