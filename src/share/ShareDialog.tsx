import { useState } from 'react';
import { useResetShare, useSetSharing } from '../api/queries';
import { errorText } from '../api/client';
import type { SharingResponse } from '../api/types';
import { shareUrl } from '../lib/shareLink';
import { formatDuration, sessionHandle } from '../lib/format';
import { Button } from '../ui/Button';
import { ConfirmDialog, Dialog } from '../ui/Dialog';
import { CopyField } from '../ui/CopyField';
import { Toggle } from '../ui/Field';
import { useToast } from '../ui/Toast';

/** What the dialog needs of a session: both the list rows and the detail carry it. */
export interface ShareTarget {
  id: string;
  isPublic: boolean;
  shareToken: string | null;
}

/**
 * Makes one session public or private and shows its link. Mount it while it is open: it starts
 * from the target's state and then follows what the server answers. `time` (seconds) offers to
 * start the link at the moment being watched.
 */
export function ShareDialog({ target, time = null, onClose }: { target: ShareTarget; time?: number | null; onClose: () => void }) {
  const notify = useToast();
  const setSharing = useSetSharing(target.id);
  const reset = useResetShare(target.id);
  const [sharing, setState] = useState<SharingResponse>({ isPublic: target.isPublic, shareToken: target.shareToken });
  const [withTime, setWithTime] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const canTime = time !== null && time > 0;
  const link = sharing.isPublic && sharing.shareToken ? shareUrl(window.location.origin, sharing.shareToken, withTime ? time : null) : null;

  const toggle = async (isPublic: boolean) => {
    try {
      setState(await setSharing.mutateAsync(isPublic));
      notify(isPublic ? 'Anyone with the link can now view this recording.' : 'This recording is private again.');
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => !open && onClose()}
        title="Share this recording"
        context={sessionHandle(target.id)}
        description="Anyone with the link can watch the replay and inspect the scene, without signing in. They cannot change or download anything."
        footer={
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="share-public" className="min-w-0 text-[14px] text-fg">
              {sharing.isPublic ? 'Public' : 'Private'}
              <span className="block text-[13px] text-fg-3">{sharing.isPublic ? 'Anyone with the link can view it.' : 'Only you can open it.'}</span>
            </label>
            <span className={setSharing.isPending ? 'pointer-events-none opacity-50' : undefined}>
              <Toggle id="share-public" label="Public link" checked={sharing.isPublic} onChange={(next) => void toggle(next)} />
            </span>
          </div>

          {link && (
            <div className="space-y-3">
              <CopyField value={link} label="link" className="h-11 w-full" />
              {canTime && (
                <label className="flex items-center gap-2.5 text-[14px] text-fg-2">
                  <input type="checkbox" className="h-4 w-4 accent-accent" checked={withTime} onChange={(e) => setWithTime(e.target.checked)} />
                  Start at {formatDuration(time)}
                </label>
              )}
              <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
                Reset link
              </Button>
            </div>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset the link?"
        confirmLabel="Reset link"
        body={<p>A new link replaces this one. The old link stops working for everyone who has it.</p>}
        onConfirm={async () => {
          setState(await reset.mutateAsync());
          notify('The link was reset.');
        }}
      />
    </>
  );
}
