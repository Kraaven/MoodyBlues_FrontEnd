import { useState } from 'react';
import { ArrowUpRight, KeyRound, RotateCw } from 'lucide-react';
import { useRotateIngestKey } from '../api/queries';
import type { ProjectDetail } from '../api/types';
import { useAuth } from '../auth/useAuth';
import { Button } from '../ui/Button';
import { CopyField } from '../ui/CopyField';
import { ConfirmDialog, Dialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';
import { formatDateTime, maskConnection } from '../lib/format';
import { useSetupGuide } from './SetupGuide';

/**
 * Unity connection: the one value that links a Unity project to this dashboard. Shown masked, copied
 * in full. Rotate replaces it when it leaks, and locks out every build that still has the old one,
 * so it asks first.
 */
export function ConnectionDialog({ project, open, onOpenChange }: { project: ProjectDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const rotate = useRotateIngestKey(project.id);
  const notify = useToast();
  const showGuide = useSetupGuide((s) => s.show);
  const [confirming, setConfirming] = useState(false);
  const hasKey = Boolean(project.ingestKeyPrefix);
  const workspace = user?.email.split('@')[0] ?? 'workspace';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange} title="Unity connection" context={`${project.name} / ${workspace}`} width="md" display>
        {project.connectionString ? (
          <div className="space-y-5">
            <p className="text-[17px] leading-7 text-fg">
              Paste this into <span className="whitespace-nowrap">MoodyBlues &rarr; Settings</span> in Unity.
            </p>
            <CopyField value={project.connectionString} display={maskConnection(project.connectionString)} label="connection string" size="lg" />
            <p className="text-[14px] text-fg-2">
              Keep this private. Only share it with your team.
              {project.ingestKeyCreatedAtUtc && <span className="text-fg-3"> Key created {formatDateTime(project.ingestKeyCreatedAtUtc)}.</span>}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-caution/30 bg-caution/8 p-4">
              <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-caution" />
              <p className="text-[14px] text-fg-2">
                {hasKey
                  ? 'This project has a key from before keys could be shown again. Rotate it to get a connection string you can copy.'
                  : 'This project has no connection key yet. Until it has one, recordings and scene uploads from Unity are refused.'}
              </p>
            </div>
          </div>
        )}

        <div className="mt-9 space-y-5">
          {project.connectionString ? (
            <Button size="lg" className="w-full justify-start" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          ) : (
            <Button size="lg" className="w-full justify-start" loading={rotate.isPending} onClick={() => setConfirming(true)}>
              <KeyRound className="h-4 w-4" />
              {hasKey ? 'Rotate key' : 'Create connection key'}
            </Button>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                showGuide(project.connectionString);
              }}
              className="inline-flex items-center gap-1 text-[15px] text-accent hover:text-accent-hover"
            >
              Installation guide <ArrowUpRight className="h-4 w-4" />
            </button>
            {project.connectionString && (
              <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-1.5 text-[13px] text-fg-3 transition-colors hover:text-[#ff9a8e]">
                <RotateCw className="h-3.5 w-3.5" />
                Rotate key
              </button>
            )}
          </div>
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
