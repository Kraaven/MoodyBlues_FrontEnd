import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Crosshair, Grid3x3, Hourglass, Keyboard, Link2, LocateFixed, Maximize, MoreHorizontal, RotateCw, X } from 'lucide-react';
import { downloadWithProgress, useProject, useRecompileSession, useScene, useSession } from '../api/queries';
import { errorText } from '../api/client';
import type { SessionDetail } from '../api/types';
import { parseReplay } from '../viewer/replay/replayFile';
import { AppShell } from '../shell/AppShell';
import { Button, IconButton } from '../ui/Button';
import { SessionStatusChip } from '../ui/Chip';
import { Menu } from '../ui/Menu';
import { ErrorState } from '../ui/States';
import { useToast } from '../ui/Toast';
import { formatAgo, formatBytes, formatDuration, formatRecorded, sceneTitle } from '../lib/format';
import { Playback, usePlayerUi } from './playback';
import { PlayerViewport } from './PlayerViewport';
import { Timeline } from './Timeline';
import { InspectorPanel } from './InspectorPanel';
import { ShortcutsDialog, usePlayerShortcuts } from './shortcuts';

interface Progress {
  replay: [number, number | null];
  scene: [number, number | null];
}

export default function SessionPlayerPage() {
  const { projectId, sceneId, sessionId } = useParams<{ projectId: string; sceneId: string; sessionId: string }>();
  const [params] = useSearchParams();
  const project = useProject(projectId);
  const scene = useScene(project.data?.developerId, sceneId);
  const session = useSession(sessionId);
  const [playback] = useState(() => new Playback());
  const [progress, setProgress] = useState<Progress>({ replay: [0, null], scene: [0, null] });
  const [sceneLoaded, setSceneLoaded] = useState(false);
  const [viewError, setViewError] = useState<unknown>(null);
  const notify = useToast();

  const ready = session.data?.status === 'Ready';
  const replay = useQuery({
    queryKey: ['replay', sessionId, session.data?.compiledAtUtc],
    enabled: Boolean(sessionId && ready),
    staleTime: Infinity,
    gcTime: 60_000,
    queryFn: async ({ signal }) => {
      const buffer = await downloadWithProgress(
        `/api/sessions/${encodeURIComponent(sessionId!)}/replay`,
        (r, t) => setProgress((p) => ({ ...p, replay: [r, t] })),
        signal,
      );
      return parseReplay(buffer);
    },
  });

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

  // Before the replay exists, the Details tab is the only one with something to show.
  const status = session.data?.status;
  useEffect(() => {
    if (status && status !== 'Ready') usePlayerUi.getState().setInspectorTab('details');
  }, [status]);

  usePlayerShortcuts(playback, replay.data?.logs ?? [], Boolean(replay.data && sceneLoaded));

  const base = `/projects/${projectId}/scenes/${encodeURIComponent(sceneId ?? '')}`;
  const title = scene.data ? sceneTitle(scene.data) : 'Scene';
  const crumbs = [
    { label: 'Projects', to: '/projects' },
    { label: project.data?.name ?? 'Project', to: `/projects/${projectId}` },
    { label: title, to: base },
    { label: session.data ? `Session · ${formatRecorded(session.data.createdAtUtc)}` : 'Session' },
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

  const error = project.error ?? session.error ?? replay.error ?? viewError;

  return (
    <AppShell crumbs={crumbs} fullBleed>
      <div className="flex h-full min-h-0">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-rule px-4">
            {session.data && (
              <>
                <SessionStatusChip status={session.data.status} />
                <span className="truncate text-[13px] text-fg-2">
                  {formatRecorded(session.data.createdAtUtc)} · {formatDuration(session.data.durationSeconds)} · {session.data.objectCount} objects
                  {session.data.spawnCount > 0 && ` · ${session.data.spawnCount} spawned`}
                </span>
              </>
            )}
            <div className="flex-1" />
            <IconButton label="Keyboard shortcuts" shortcut="?" size="sm" onClick={() => usePlayerUi.getState().setShortcutsOpen(true)}>
              <Keyboard className="h-4 w-4" />
            </IconButton>
            <Menu
              trigger={
                <IconButton label="Session actions" size="sm" tooltip={false}>
                  <MoreHorizontal className="h-4 w-4" />
                </IconButton>
              }
              items={[{ label: 'Copy link to this moment', icon: Link2, onSelect: () => void copyLink() }]}
            />
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            {error ? (
              <Centered>
                <ErrorState
                  error={error}
                  title={replay.error ? 'The replay did not load' : viewError ? 'The scene did not load' : 'This session did not load'}
                  onRetry={() => {
                    setViewError(null);
                    void session.refetch();
                    void replay.refetch();
                  }}
                  className="max-w-lg"
                />
              </Centered>
            ) : session.data && !ready ? (
              <NotReady session={session.data} />
            ) : project.data && session.data && replay.data ? (
              <>
                <PlayerViewport
                  developerId={project.data.developerId}
                  sceneId={session.data.sceneId}
                  sceneHash={session.data.sceneHash}
                  replay={replay.data}
                  playback={playback}
                  onProgress={(r, t) => setProgress((p) => ({ ...p, scene: [r, t] }))}
                  onLoaded={() => setSceneLoaded(true)}
                  onError={setViewError}
                />
                {!sceneLoaded && <LoadingOverlay label="Downloading the scene" progress={progress.scene} />}
                {sceneLoaded && <ViewportOverlays playback={playback} />}
              </>
            ) : (
              <LoadingOverlay label="Downloading the replay" progress={progress.replay} />
            )}
          </div>

          <Timeline playback={playback} replay={replay.data ?? null} disabled={!replay.data || !sceneLoaded} />
        </div>

        {session.data && <InspectorPanel session={session.data} replay={replay.data ?? null} playback={playback} sceneHref={base} />}
      </div>
      <ShortcutsDialog />
    </AppShell>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center p-6">{children}</div>;
}

function LoadingOverlay({ label, progress: [received, total] }: { label: string; progress: [number, number | null] }) {
  const fraction = total ? Math.min(1, received / total) : null;
  return (
    <Centered>
      <div className="w-72 space-y-3 text-center">
        <p className="text-[13px] text-fg-2">
          {received > 0 && fraction === 1 ? 'Preparing playback…' : label}
          {received > 0 && fraction !== 1 && <span className="tabular text-fg-3"> · {formatBytes(received)}{total ? ` of ${formatBytes(total)}` : ''}</span>}
        </p>
        <div className="h-1 overflow-hidden rounded-full bg-ink-3">
          {fraction === null ? (
            <div className="shimmer h-full w-full" />
          ) : (
            <div className="h-full rounded-full bg-gradient-to-r from-blue to-blue-bright transition-[width] duration-200" style={{ width: `${fraction * 100}%` }} />
          )}
        </div>
      </div>
    </Centered>
  );
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
      icon = <AlertTriangle className="h-5 w-5 text-caution" />;
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
  }

  return (
    <Centered>
      <div className="max-w-md animate-rise text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-rule bg-ink-2">{icon}</div>
        <p className="text-[16px] font-semibold text-fg">{title}</p>
        <div className="mt-2 text-sm text-fg-2">{body}</div>
        {(session.status === 'Queued' || session.status === 'Compiling') && <div className="shimmer mx-auto mt-5 h-1 w-48 rounded-full" />}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </Centered>
  );
}

/** View controls (top-right) and the selected-object chip (bottom-left). */
function ViewportOverlays({ playback }: { playback: Playback }) {
  const selectedId = usePlayerUi((s) => s.selectedId);
  const follow = usePlayerUi((s) => s.follow);
  const showGrid = usePlayerUi((s) => s.showGrid);
  const ui = usePlayerUi.getState();
  const name = selectedId === null ? '' : (playback.player?.nameOf(selectedId) ?? `Object ${selectedId}`);

  return (
    <>
      <div className="glass elevated absolute right-3 top-3 flex items-center gap-0.5 rounded-[var(--radius-card)] border border-rule p-1">
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
        <div className="glass elevated absolute bottom-3 left-3 flex animate-rise items-center gap-2 rounded-[var(--radius-card)] border border-rule py-1 pl-3 pr-1">
          <span className="h-2 w-2 rounded-full bg-blue-bright shadow-[0_0_8px_rgb(255_181_71/0.8)]" />
          <button type="button" className="text-left" onClick={() => ui.setInspectorTab('objects')}>
            <span className="block max-w-[260px] truncate text-[13px] font-medium text-fg">{name}</span>
            <span className="tabular block font-mono text-[11px] text-fg-3">#{selectedId}</span>
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
