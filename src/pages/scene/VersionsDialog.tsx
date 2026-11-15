import { useState } from 'react';
import { Download, Eye, Trash2 } from 'lucide-react';
import { sceneFilePath, saveDownload, useDeleteArchive, useDeleteVersion } from '../../api/queries';
import { errorText } from '../../api/client';
import type { ProjectDetail, SceneDetail, SceneVersion } from '../../api/types';
import { Button, IconButton } from '../../ui/Button';
import { Tag, versionLabel, VersionStatus } from '../../ui/Chip';
import { ConfirmDialog, Dialog } from '../../ui/Dialog';
import { useToast } from '../../ui/Toast';
import { formatBytes, formatCaptured, formatCount, plural, safeFilename, sceneTitle } from '../../lib/format';

/**
 * Every export of a scene, with its size, and the means to clean up the old ones. Reading the
 * recordings of a version happens on the scene page (the version picker); this is housekeeping.
 */
export function VersionsDialog({
  open,
  onOpenChange,
  project,
  scene,
  base,
  onOpen,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDetail;
  scene: SceneDetail;
  base: string;
  onOpen: (href: string) => void;
}) {
  const [deletingAll, setDeletingAll] = useState(false);
  const [deleting, setDeleting] = useState<SceneVersion | null>(null);
  const removeAll = useDeleteArchive(project.developerId, scene.sceneId);
  const removeOne = useDeleteVersion(project.developerId, scene.sceneId);
  const notify = useToast();
  const name = sceneTitle(scene);
  const versions = [scene.current, ...scene.archived].filter((v): v is SceneVersion => v !== null);
  const archivedSessions = scene.archived.reduce((n, v) => n + v.sessionCount, 0);
  const archivedBytes = scene.archived.reduce((n, v) => n + v.sizeBytes + v.sessionBytes, 0);

  const download = async (v: SceneVersion) => {
    try {
      await saveDownload(sceneFilePath(project.developerId, scene.sceneId, v.hash), safeFilename(`${name}-${versionLabel(v.version)}`, '.glb'));
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} title="Scene versions" context={name} description="Each export keeps its own geometry, assets and recordings." width="lg">
        <ul className="divide-y divide-rule rounded-[var(--radius-card)] border border-rule">
          {versions.map((v) => (
            <li key={v.version} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[14px] text-fg">
                  <span className="tabular">{versionLabel(v.version)}</span>
                  {v.isCurrent && <Tag tone="accent">Latest</Tag>}
                  {v.processingStatus !== 'Ready' && <VersionStatus status={v.processingStatus} />}
                </p>
                <p className="mt-0.5 truncate text-[13px] text-fg-3">
                  {formatCaptured(v.uploadedAtUtc)} · {plural(v.trackedObjectCount, 'object')} · {plural(v.sessionCount, 'recording')} · {formatBytes(v.sizeBytes + v.sessionBytes)}
                </p>
              </div>
              <IconButton label={`Open ${versionLabel(v.version)} in 3D`} size="sm" onClick={() => onOpen(`${base}/view${v.isCurrent ? '' : `?version=${v.version}`}`)}>
                <Eye className="h-4 w-4" />
              </IconButton>
              <IconButton label={`Download ${versionLabel(v.version)} as .glb`} size="sm" onClick={() => void download(v)}>
                <Download className="h-4 w-4" />
              </IconButton>
              {!v.isCurrent && (
                <IconButton label={`Delete ${versionLabel(v.version)}`} size="sm" onClick={() => setDeleting(v)}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
        {scene.archived.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-fg-3">
              Archive: {plural(scene.archived.length, 'version')} · {plural(archivedSessions, 'session')} · {formatBytes(archivedBytes)}
            </p>
            <Button variant="danger" size="sm" onClick={() => setDeletingAll(true)}>
              <Trash2 className="h-4 w-4" />
              Delete all archived
            </Button>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={deletingAll}
        onOpenChange={setDeletingAll}
        title={`Delete ${plural(scene.archived.length, 'archived version')} of ${name}?`}
        confirmLabel="Delete archive"
        typeToConfirm={name}
        body={
          <p>
            This deletes {plural(archivedSessions, 'session')} and <span className="text-fg">{formatBytes(archivedBytes)}</span>. The latest version
            {scene.current ? ` ${versionLabel(scene.current.version)}` : ''} and its sessions are kept.
          </p>
        }
        onConfirm={async () => {
          const r = await removeAll.mutateAsync();
          notify(`Deleted ${plural(r.deletedVersions, 'version')} and ${plural(r.deletedSessions, 'session')}, freed ${formatBytes(r.freedBytes)}.`);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting ? `Delete ${versionLabel(deleting.version)} of ${name}?` : 'Delete version?'}
        confirmLabel="Delete version"
        typeToConfirm={name}
        body={
          deleting && (
            <p>
              This deletes {plural(deleting.sessionCount, 'session')} and <span className="text-fg">{formatBytes(deleting.sizeBytes + deleting.sessionBytes)}</span>.
            </p>
          )
        }
        onConfirm={async () => {
          if (!deleting) return;
          const r = await removeOne.mutateAsync(deleting.version);
          notify(`Deleted ${versionLabel(deleting.version)} and ${formatCount(r.deletedSessions)} ${r.deletedSessions === 1 ? 'session' : 'sessions'}, freed ${formatBytes(r.freedBytes)}.`);
        }}
      />
    </>
  );
}
