import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { projectQuery, sessionsQuery, useProjects } from '../api/queries';
import type { ProjectDetail, ProjectScene, ProjectSummary, SessionSummary } from '../api/types';

/**
 * How far the lobby looks (DESIGN.md 7.2, 13). There is no "everything that needs attention" route,
 * so the lobby checks a bounded window: the few most recently created projects, and for each the
 * scene updated most recently. At most 1 + 4 + 4 * 2 = 13 requests, sharing cache entries with the
 * project and scene pages, refreshed every 30 s while the tab is visible.
 */
export const ACTIVITY_PROJECTS = 4;

export interface ActivityItem {
  id: string;
  kind: 'recording' | 'failed' | 'waiting' | 'no-key' | 'optimize-failed';
  project: ProjectSummary;
  scene?: ProjectScene;
  session?: SessionSummary;
  /** Sessions waiting, for the `waiting` kind. */
  count?: number;
}

const POLL_MS = 30_000;

export function useRecentActivity() {
  const projects = useProjects();

  const recent = useMemo(
    () => [...(projects.data ?? [])].sort((a, b) => b.createdAtUtc.localeCompare(a.createdAtUtc)).slice(0, ACTIVITY_PROJECTS),
    [projects.data],
  );

  const detailResults = useQueries({ queries: recent.map((p) => ({ ...projectQuery(p.id), refetchInterval: POLL_MS })) });
  const details = recent.map((_, i) => detailResults[i]?.data as ProjectDetail | undefined);

  // The most recently updated scene of each project in the window.
  const targets = recent.map((project, i) => {
    const detail = details[i];
    const scene = detail ? [...detail.scenes].sort((a, b) => b.updatedAtUtc.localeCompare(a.updatedAtUtc))[0] : undefined;
    return { project, detail, scene };
  });

  const sessionQueries = targets.flatMap((t) =>
    t.detail && t.scene
      ? [
          { target: t, kind: 'version' as const, ...sessionsQuery(t.detail.developerId, t.scene.sceneId, { version: t.scene.currentVersion }), refetchInterval: POLL_MS },
          { target: t, kind: 'waiting' as const, ...sessionsQuery(t.detail.developerId, t.scene.sceneId, { awaitingScene: true }), refetchInterval: POLL_MS },
        ]
      : [],
  );
  const sessionResults = useQueries({ queries: sessionQueries.map(({ target: _t, kind: _k, ...query }) => query) });

  const items = useMemo(() => {
    const now: ActivityItem[] = [];
    const attention: ActivityItem[] = [];

    for (const project of projects.data ?? []) {
      if (!project.ingestKeyPrefix) attention.push({ id: `nokey-${project.id}`, kind: 'no-key', project });
    }
    targets.forEach((t) => {
      if (t.scene && t.scene.processingStatus === 'Failed') {
        attention.push({ id: `optimize-${t.project.id}-${t.scene.sceneId}`, kind: 'optimize-failed', project: t.project, scene: t.scene });
      }
    });
    sessionQueries.forEach((q, i) => {
      const data = sessionResults[i]?.data as SessionSummary[] | undefined;
      if (!data) return;
      const { project, scene } = q.target;
      if (q.kind === 'waiting') {
        if (data.length > 0) attention.push({ id: `waiting-${project.id}-${scene?.sceneId}`, kind: 'waiting', project, scene, count: data.length });
        return;
      }
      for (const session of data) {
        if (session.status === 'Recording') now.push({ id: `rec-${session.id}`, kind: 'recording', project, scene, session });
        else if (session.status === 'Failed') attention.push({ id: `fail-${session.id}`, kind: 'failed', project, scene, session });
      }
    });
    return { now, attention };
    // `targets` and `sessionQueries` are rebuilt every render from the same data; the results drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects.data, detailResults.map((r) => r.dataUpdatedAt).join(), sessionResults.map((r) => r.dataUpdatedAt).join()]);

  const loadingWindow = detailResults.some((r) => r.isPending) || sessionResults.some((r) => r.isPending);

  return {
    projects,
    details: new Map(recent.map((p, i) => [p.id, details[i]] as const)),
    now: items.now,
    attention: items.attention,
    loadingWindow,
  };
}
