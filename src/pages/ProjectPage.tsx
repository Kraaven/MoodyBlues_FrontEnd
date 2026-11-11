import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronRight, KeyRound, Plus } from 'lucide-react';
import { useProject, useScene } from '../api/queries';
import type { ProjectDetail, ProjectScene } from '../api/types';
import { ConnectionDialog } from '../shell/ConnectionDialog';
import { SetupSteps } from '../shell/SetupGuide';
import { PageBody, WorkspaceLayout } from '../shell/WorkspaceLayout';
import { StageWindow } from '../stage/StageWindow';
import { useStage, type StageView } from '../stage/store';
import { useStageView } from '../stage/useStageView';
import { Button, LinkButton } from '../ui/Button';
import { versionLabel, VersionStatus } from '../ui/Chip';
import { SnapshotImage } from '../ui/SnapshotImage';
import { ErrorState, FactRow, Overline, Skeleton } from '../ui/States';
import { formatBytes, formatCaptured, formatCount, sceneTitle } from '../lib/format';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useWindowTitle } from '../lib/useWindowTitle';

/** Scenes above this size wait for a click before the Stage downloads them. */
export const AUTO_LOAD_MAX_BYTES = 25 * 1024 * 1024;

const NONE: StageView = { id: 'project', content: 'none', dim: 0 };

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [params, setParams] = useSearchParams();
  const project = useProject(projectId);
  const [connecting, setConnecting] = useState(false);
  const data = project.data;
  useWindowTitle(data?.name ?? 'Project');

  // Arriving from "Create project": open the Unity connection straight away.
  useEffect(() => {
    if (params.get('connect') && data) {
      setConnecting(true);
      setParams({}, { replace: true });
    }
  }, [params, data, setParams]);

  const scenes = useMemo(() => (data ? [...data.scenes].sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc)) : []), [data]);
  const featured = scenes[0];
  // The featured scene directs the Stage when there is one; otherwise the page has no 3D.
  useStageView(featured ? null : NONE);

  return (
    <WorkspaceLayout>
      <PageBody>
        {project.isError ? (
          <ErrorState error={project.error} title="This project did not load" onRetry={() => project.refetch()} />
        ) : !data ? (
          <div className="space-y-8">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-16 w-96" />
            <Skeleton className="h-[480px]" />
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-start justify-between gap-6">
              <div className="min-w-0 animate-rise">
                <Overline>
                  Project / <span className="text-fg-2">{data.name}</span>
                </Overline>
                <h1 className="display mt-6 truncate text-[48px] leading-[56px] text-fg sm:text-[64px] sm:leading-[72px]">{data.name}</h1>
                <p className="mt-2 text-[16px] text-fg-2">A shared view of everything that happened.</p>
              </div>
              <LinkButton to="/projects/new" className="min-w-[180px] justify-start">
                <Plus className="h-4 w-4" />
                New project
              </LinkButton>
            </header>

            <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-b border-rule pb-4">
              <div className="flex items-baseline gap-3">
                <h2 className="text-[17px] text-fg">Scenes</h2>
                <span className="tabular font-mono text-[11px] text-accent">{String(scenes.length).padStart(2, '0')}</span>
              </div>
              <div className="flex items-center gap-3">
                {!data.connectionString && <span className="text-[13px] text-caution">{data.ingestKeyPrefix ? 'Rotate the key to see it' : 'No connection key yet'}</span>}
                <Button variant="quiet" className="min-w-[200px] justify-start" onClick={() => setConnecting(true)}>
                  <KeyRound className="h-4 w-4 text-fg-2" />
                  Connection
                </Button>
              </div>
            </div>

            {scenes.length === 0 ? (
              <NoScenes onConnect={() => setConnecting(true)} />
            ) : (
              <>
                <FeaturedScene project={data} scene={featured} />
                {scenes.length > 1 && (
                  <section aria-label="Other scenes" className="mt-12">
                    <Overline>Other scenes</Overline>
                    <ul className="mt-4 divide-y divide-rule overflow-hidden rounded-[var(--radius-card)] border border-rule bg-ink-1">
                      {scenes.slice(1).map((scene) => (
                        <SceneRow key={scene.sceneId} project={data} scene={scene} />
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}

            <ConnectionDialog project={data} open={connecting} onOpenChange={setConnecting} />
          </>
        )}
      </PageBody>
    </WorkspaceLayout>
  );
}

function NoScenes({ onConnect }: { onConnect: () => void }) {
  return (
    <section className="mt-8 grid gap-10 rounded-[var(--radius-card)] border border-dashed border-rule-strong p-8 lg:grid-cols-[1fr_1fr] lg:p-12">
      <div>
        <Overline accent>02 / Connect Unity</Overline>
        <p className="display mt-6 text-[32px] leading-[40px] text-fg">No scenes yet.</p>
        <p className="mt-3 max-w-md text-[15px] text-fg-2">
          Paste the connection string into Unity, then export a scene. It appears here by itself; this page checks every 15 seconds.
        </p>
        <Button size="lg" className="mt-9 min-w-[260px]" trailing={<ArrowRight className="h-5 w-5" />} onClick={onConnect}>
          Get the connection string
        </Button>
      </div>
      <SetupSteps current={1} />
    </section>
  );
}

/** The latest scene, live in 3D in a window on the page. */
function FeaturedScene({ project, scene }: { project: ProjectDetail; scene: ProjectScene }) {
  const detail = useScene(project.developerId, scene.sceneId);
  const phone = useMediaQuery('(max-width: 767px)');
  const [loadLarge, setLoadLarge] = useState(false);
  const sceneState = useStage((s) => s.scene.status);
  const tooBig = scene.sizeBytes > AUTO_LOAD_MAX_BYTES && !loadLarge;
  const live = !phone && !tooBig && Boolean(scene.latestHash);
  const href = `/projects/${project.id}/scenes/${encodeURIComponent(scene.sceneId)}`;

  const view: StageView = live
    ? {
        id: 'project',
        content: 'scene',
        scene: { developerId: project.developerId, sceneId: scene.sceneId, hash: scene.latestHash },
        control: 'free',
        idleOrbit: true,
        zoom: false,
        dim: 1,
        durationMs: 800,
      }
    : NONE;
  useStageView(view);

  const s = detail.data;
  const versions = s ? (s.current ? 1 : 0) + s.archived.length : scene.revisionCount;
  const sessions = s ? (s.current?.sessionCount ?? 0) + s.archived.reduce((n, v) => n + v.sessionCount, 0) : null;

  // No transform animation on the article: it would make a stacking context, and the StageWindow's
  // page-coloured surround would then cover the page header.
  return (
    <article className="mt-8 grid rounded-[var(--radius-card)] border border-rule lg:grid-cols-[1.55fr_1fr]">
      {live ? (
        <StageWindow className="min-h-[340px] rounded-t-[var(--radius-card)] lg:min-h-[500px] lg:rounded-l-[var(--radius-card)] lg:rounded-tr-none">
          {sceneState === 'loading' && <span className="sweep absolute inset-x-0 bottom-0 h-px bg-rule" />}
          <span className="pointer-events-none absolute bottom-4 left-5 font-mono text-[11px] text-fg-3">Drag to turn</span>
        </StageWindow>
      ) : (
        <div className="relative min-h-[300px] overflow-hidden rounded-t-[var(--radius-card)] lg:min-h-[500px] lg:rounded-l-[var(--radius-card)] lg:rounded-tr-none">
          <SnapshotImage hash={scene.latestHash} seed={scene.sceneId} className="absolute inset-0 rounded-none" />
          {tooBig && !phone && (
            <div className="absolute bottom-5 left-5">
              <Button variant="quiet" className="glass" onClick={() => setLoadLarge(true)}>
                Load the 3D scene · {formatBytes(scene.sizeBytes)}
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col rounded-b-[var(--radius-card)] border-t border-rule bg-ink-1 p-8 lg:rounded-bl-none lg:rounded-r-[var(--radius-card)] lg:border-l lg:border-t-0 lg:p-9">
        <Overline>Current scene</Overline>
        <Link to={href} className="display mt-6 block truncate text-[40px] leading-[46px] text-fg transition-colors hover:text-accent">
          {sceneTitle(scene)}
        </Link>
        <p className="mt-3 truncate font-mono text-[12px] text-fg-3" title={scene.sceneId}>
          GUID / {scene.sceneId}
        </p>

        <dl className="mt-8 border-t border-rule pt-6">
          <FactRow label="Latest export">{versionLabel(scene.currentVersion)}</FactRow>
          <FactRow label="Tracked objects">{s?.current ? formatCount(s.current.trackedObjectCount) : '—'}</FactRow>
          <FactRow label="Recorded sessions">{sessions === null ? '—' : `${formatCount(sessions)} across ${versions} ${versions === 1 ? 'version' : 'versions'}`}</FactRow>
          <FactRow label="Uploaded">{formatCaptured(scene.updatedAtUtc)}</FactRow>
          <FactRow label="Size">{formatBytes(scene.sizeBytes)}</FactRow>
          {scene.processingStatus !== 'Ready' && (
            <div className="flex items-baseline justify-between py-2">
              <dt className="text-[14px] text-fg-2">Status</dt>
              <dd>
                <VersionStatus status={scene.processingStatus} />
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-auto pt-10">
          <LinkButton to={href} className="w-full justify-start">
            <ArrowRight className="h-4 w-4" />
            Scene details
          </LinkButton>
        </div>
      </div>
    </article>
  );
}

function SceneRow({ project, scene }: { project: ProjectDetail; scene: ProjectScene }) {
  return (
    <li>
      <Link to={`/projects/${project.id}/scenes/${encodeURIComponent(scene.sceneId)}`} className="group flex items-center gap-5 px-5 py-4 transition-colors duration-[140ms] hover:bg-ink-3/60">
        <SnapshotImage hash={scene.latestHash} seed={scene.sceneId} className="h-[60px] w-[100px] shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] text-fg">{sceneTitle(scene)}</p>
          <p className="mt-0.5 truncate font-mono text-[12px] text-fg-3">
            {versionLabel(scene.currentVersion)} · {formatCaptured(scene.updatedAtUtc)} · {formatBytes(scene.sizeBytes)}
          </p>
        </div>
        {scene.processingStatus !== 'Ready' && (
          <span className="hidden sm:inline-flex">
            <VersionStatus status={scene.processingStatus} />
          </span>
        )}
        <ChevronRight className="h-5 w-5 text-fg-3 transition-transform duration-[140ms] group-hover:translate-x-0.5 group-hover:text-fg" />
      </Link>
    </li>
  );
}
