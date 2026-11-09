import { useState } from 'react';
import { RotateCw } from 'lucide-react';
import { useRotateIngestKey } from '../api/queries';
import type { ProjectDetail } from '../api/types';
import { Button } from '../ui/Button';
import { CopyField } from '../ui/CopyField';
import { ConfirmDialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';
import { formatDateTime, maskConnection } from '../lib/format';

/** The connection string with a copy button. Shows it masked; copies it in full. */
export function ConnectionField({ connectionString, className }: { connectionString: string; className?: string }) {
  return (
    <CopyField value={connectionString} display={maskConnection(connectionString)} label="connection string" className={className} />
  );
}

/**
 * The project page's connection line (DESIGN.md 7.3): the connection string to paste into Unity,
 * and Rotate for when the key leaks.
 */
export function ConnectionControl({ project }: { project: ProjectDetail }) {
  const rotate = useRotateIngestKey(project.id);
  const notify = useToast();
  const [confirming, setConfirming] = useState(false);
  const hasKey = Boolean(project.ingestKeyPrefix);

  return (
    <>
      <span className="text-fg-3">Connection</span>
      {project.connectionString ? (
        <span title={project.ingestKeyCreatedAtUtc ? `Key created ${formatDateTime(project.ingestKeyCreatedAtUtc)}` : undefined}>
          <ConnectionField connectionString={project.connectionString} />
        </span>
      ) : (
        <span className="text-warn">
          {hasKey ? 'not viewable for this older key; rotate to get one' : 'none yet, recordings are refused'}
        </span>
      )}
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        <RotateCw className="h-3.5 w-3.5" />
        {hasKey ? 'Rotate' : 'Create'}
      </Button>

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
                The current key (<span className="font-mono text-fg">{project.ingestKeyPrefix}…</span>) stops working at once. Every
                build and Editor that still has it is refused until it has the new connection string.
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
