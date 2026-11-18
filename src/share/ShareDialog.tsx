import { useMemo, useState } from 'react';
import { useProject, useResetShare, useSession, useSetShareDefaults, useSetShareSettings, useSetSharing } from '../api/queries';
import { errorText } from '../api/client';
import type { SharingResponse } from '../api/types';
import { shareUrl } from '../lib/shareLink';
import { sessionHandle } from '../lib/format';
import { listCameras } from '../studio/cameras';
import { useStudio } from '../studio/studioStore';
import { Button } from '../ui/Button';
import { ConfirmDialog, Dialog } from '../ui/Dialog';
import { CopyField } from '../ui/CopyField';
import { Toggle } from '../ui/Field';
import { useToast } from '../ui/Toast';
import { parseShareSettings, toTemplate, type ShareSettings } from './shareSettings';
import { ShareSettingsEditor } from './ShareSettingsEditor';
import { SaveStatus } from './SaveStatus';
import { useAutosave } from './useAutosave';

/** What the dialog needs of a session: both the list rows and the detail carry it. */
export interface ShareTarget {
  id: string;
  isPublic: boolean;
  shareToken: string | null;
}

/**
 * Makes one session public or private, shows its link, and sets what its visitors start with and
 * may change. Mount it while it is open: it starts from the target's state and then follows what
 * the server answers. `time` (seconds) is given when it is opened from the studio, which has the
 * scene loaded: the cameras can then be picked from, and the start time set to the moment being
 * watched.
 */
export function ShareDialog({ target, time, onClose }: { target: ShareTarget; time?: number; onClose: () => void }) {
  const notify = useToast();
  const setSharing = useSetSharing(target.id);
  const reset = useResetShare(target.id);
  const [sharing, setState] = useState<SharingResponse>({ isPublic: target.isPublic, shareToken: target.shareToken });
  const [confirmReset, setConfirmReset] = useState(false);

  const link = sharing.isPublic && sharing.shareToken ? shareUrl(window.location.origin, sharing.shareToken) : null;

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
        width="md"
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
              <Button variant="secondary" size="sm" onClick={() => setConfirmReset(true)}>
                Reset link
              </Button>
            </div>
          )}

          {sharing.isPublic && <ViewerSettings sessionId={target.id} time={time} />}
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

/** The "Viewer settings" section: loads the link's settings, then saves every edit by itself. */
function ViewerSettings({ sessionId, time }: { sessionId: string; time?: number }) {
  const session = useSession(sessionId);
  const project = useProject(session.data?.projectId);
  // Both are needed to know what the link starts from: a link without settings of its own follows the project's.
  const ready = session.data !== undefined && (project.data !== undefined || project.isError);

  return (
    <section aria-label="Viewer settings" className="space-y-4 border-t border-rule pt-5">
      <div>
        <h3 className="text-[15px] font-medium text-fg">Viewer settings</h3>
        <p className="mt-1 text-[13px] leading-5 text-fg-3">What visitors of this link start with, and what they cannot change. Your own studio is never restricted.</p>
      </div>
      {ready && session.data ? (
        <ViewerSettingsEditor sessionId={sessionId} initial={parseShareSettings(session.data.shareSettings ?? project.data?.shareDefaults ?? null)} projectId={session.data.projectId} defaults={project.data?.shareDefaults ?? null} time={time} />
      ) : session.isError ? (
        <p className="text-[13px] text-danger-soft">{errorText(session.error)}</p>
      ) : (
        <p className="text-[13px] text-fg-3">Loading…</p>
      )}
    </section>
  );
}

function ViewerSettingsEditor({ sessionId, projectId, initial, defaults, time }: { sessionId: string; projectId: string; initial: ShareSettings; defaults: unknown; time?: number }) {
  const notify = useToast();
  const [settings, setSettings] = useState(initial);
  const [confirmReset, setConfirmReset] = useState(false);
  const saveSettings = useSetShareSettings(sessionId);
  const saveDefaults = useSetShareDefaults(projectId);
  const autosave = useAutosave<ShareSettings>(
    (value) => saveSettings.mutateAsync(value),
    (err) => notify(errorText(err), 'error'),
  );

  // From the studio the scene is loaded and its cameras can be listed; from the recordings table they cannot.
  const root = useStudio((s) => s.root);
  const cameras = useMemo(() => (time !== undefined && root ? listCameras(root).map((c) => ({ id: c.id, name: c.name })) : null), [time, root]);

  const change = (next: ShareSettings) => {
    setSettings(next);
    autosave.schedule(next);
  };

  const saveAsDefault = async () => {
    try {
      await saveDefaults.mutateAsync(toTemplate(settings));
      notify('Saved as the project default for new links.');
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  return (
    <>
      <ShareSettingsEditor value={settings} onChange={change} cameras={cameras} currentTime={time ?? null} />
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button variant="secondary" size="sm" loading={saveDefaults.isPending} onClick={() => void saveAsDefault()}>
          Save as project default
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
          Reset to project default
        </Button>
        <SaveStatus state={autosave.state} className="ml-auto" />
      </div>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset to the project default?"
        confirmLabel="Reset settings"
        destructive={false}
        body={<p>This link&rsquo;s viewer settings are replaced by the project&rsquo;s defaults. The link itself does not change.</p>}
        onConfirm={async () => {
          autosave.cancel();
          const saved = await saveSettings.mutateAsync(defaults ?? null);
          setSettings(parseShareSettings(saved.settings ?? defaults));
          notify('Viewer settings reset to the project default.');
        }}
      />
    </>
  );
}
