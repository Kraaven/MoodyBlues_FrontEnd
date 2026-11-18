import { useState } from 'react';
import { useSetShareDefaults } from '../api/queries';
import { errorText } from '../api/client';
import type { ProjectDetail } from '../api/types';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { useToast } from '../ui/Toast';
import { parseShareSettings, toTemplate, type ShareSettings } from './shareSettings';
import { SaveStatus } from './SaveStatus';
import { ShareSettingsEditor } from './ShareSettingsEditor';
import { useAutosave } from './useAutosave';

/**
 * Edits a project's share defaults: the viewer settings a recording's link starts with when it is
 * first made public. Changes save by themselves. Mount it while it is open.
 */
export function ShareDefaultsDialog({ project, onClose }: { project: ProjectDetail; onClose: () => void }) {
  const notify = useToast();
  const [settings, setSettings] = useState<ShareSettings>(() => parseShareSettings(project.shareDefaults));
  const save = useSetShareDefaults(project.id);
  const autosave = useAutosave<ShareSettings>(
    (value) => save.mutateAsync(toTemplate(value)),
    (err) => notify(errorText(err), 'error'),
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="Share defaults"
      context={project.name}
      description="New share links start with these settings. Links that are already shared keep their own."
      width="md"
      footer={
        <>
          <SaveStatus state={autosave.state} className="mr-auto self-center" />
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <ShareSettingsEditor
        value={settings}
        template
        cameras={null}
        onChange={(next) => {
          setSettings(next);
          autosave.schedule(next);
        }}
      />
    </Dialog>
  );
}
