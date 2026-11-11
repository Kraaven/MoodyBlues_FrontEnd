import { useState } from 'react';
import { ChevronRight, KeyRound, RotateCw } from 'lucide-react';
import { useRotateIngestKey } from '../api/queries';
import type { ProjectDetail } from '../api/types';
import { Button } from '../ui/Button';
import { CopyField } from '../ui/CopyField';
import { ConfirmDialog, Dialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';
import { formatDateTime, maskConnection } from '../lib/format';
import { SetupSteps } from './SetupGuide';

/**
 * Unity connection: the one value that links a Unity project to this dashboard. Shown masked, copied
 * in full, with the setup steps one click away. Rotate replaces it when it leaks, and locks out every
 * build that still has the old one, so it asks first.
 */
export function ConnectionDialog({ project, open, onOpenChange }: { project: ProjectDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const rotate = useRotateIngestKey(project.id);
  const notify = useToast();
  const [confirming, setConfirming] = useState(false);
  const hasKey = Boolean(project.ingestKeyPrefix);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} title="Unity connection" context={project.name} width="md">
        {project.connectionString ? (
          <div className="space-y-4">
            <p className="text-[14px] text-fg-2">
              Paste this into <span className="text-fg">MoodyBlues &gt; Settings</span> in Unity, once per Unity project.
            </p>
            <CopyField value={project.connectionString} display={maskConnection(project.connectionString)} label="connection string" size="lg" />
            <p className="text-[13px] text-fg-3">
              Keep it private; share it only with your team.
              {project.ingestKeyCreatedAtUtc && <> Created {formatDateTime(project.ingestKeyCreatedAtUtc)}.</>}
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-caution/30 bg-caution/8 p-4">
            <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-caution" />
            <p className="text-[14px] text-fg-2">
              {hasKey
                ? 'This project has a key from before keys could be shown again. Rotate it to get a connection string you can copy.'
                : 'This project has no connection key yet. Until it has one, recordings and scene uploads from Unity are refused.'}
            </p>
          </div>
        )}

        <details className="group mt-6 border-t border-rule pt-4">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[14px] text-fg-2 transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
            Setup steps
          </summary>
          <div className="mt-5">
            <SetupSteps current={1} compact />
          </div>
        </details>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          {project.connectionString ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
                <RotateCw className="h-3.5 w-3.5" />
                Rotate key
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </>
          ) : (
            <Button loading={rotate.isPending} onClick={() => setConfirming(true)}>
              <KeyRound className="h-4 w-4" />
              {hasKey ? 'Rotate key' : 'Create connection key'}
            </Button>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={hasKey ? 'Rotate the connection key?' : 'Create a connection key?'}
        confirmLabel={hasKey ? 'Rotate key' : 'Create key'}
        destructive={hasKey}
        body={
          hasKey ? (
            <>
              <p>
                The current key (<span className="font-mono text-fg">{project.ingestKeyPrefix}…</span>) stops working at once. Every build and Editor that still has it is
                refused until it has the new connection string.
              </p>
              <p>Only do this if the key leaked. Recordings already on the server are not affected.</p>
            </>
          ) : (
            <p>Unity sends this key with every recording and scene upload. Without one, the server refuses them.</p>
          )
        }
        onConfirm={async () => {
          await rotate.mutateAsync();
          notify('New connection string ready. Paste it into MoodyBlues > Settings in Unity, then rebuild.');
        }}
      />
    </>
  );
}
