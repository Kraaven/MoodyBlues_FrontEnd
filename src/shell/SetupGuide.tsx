import { create } from 'zustand';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { CopyField } from '../ui/CopyField';
import { maskConnection } from '../lib/format';

/** The Unity quickstart, reachable from anywhere ("Need a hand?", the Unity connection dialog). */
export const useSetupGuide = create<{ open: boolean; connectionString: string | null; show: (connectionString?: string | null) => void; hide: () => void }>((set) => ({
  open: false,
  connectionString: null,
  show: (connectionString = null) => set({ open: true, connectionString }),
  hide: () => set({ open: false }),
}));

export const SETUP_STEPS = [
  {
    title: 'Create your project',
    body: 'One project per Unity game. It holds every scene you export and every session recorded in them.',
  },
  {
    title: 'Connect Unity',
    body: (
      <>
        In Unity, open <b className="font-medium text-fg">MoodyBlues &gt; Settings</b>, paste the project's connection string and press{' '}
        <b className="font-medium text-fg">Test Connection</b>. It is set once for the whole Unity project.
      </>
    ),
  },
  {
    title: 'Record. Replay. Understand.',
    body: (
      <>
        Add <code className="font-mono text-[12px] text-fg">MoodyBluesSessionManager</code> and <code className="font-mono text-[12px] text-fg">MoodyBluesRuntimeManager</code> to
        the scene, then run <b className="font-medium text-fg">MoodyBlues &gt; Export This Scene</b> or build. Press Play, and the session appears here.
      </>
    ),
  },
];

/** The numbered steps, joined by a line, as on the create-project page. */
export function SetupSteps({ current = 0, compact = false }: { current?: number; compact?: boolean }) {
  return (
    <ol className="relative">
      {SETUP_STEPS.map((step, i) => (
        <li key={step.title} className={compact ? 'relative flex gap-4 pb-6 last:pb-0' : 'relative flex gap-5 pb-10 last:pb-0'}>
          {i < SETUP_STEPS.length - 1 && <span aria-hidden="true" className="absolute left-[19px] top-12 bottom-2 w-px bg-rule-strong" />}
          <span
            className={
              'tabular relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-[12px] ' +
              (i === current ? 'bg-accent/18 text-accent' : 'bg-ink-4 text-fg-3')
            }
          >
            {String(i + 1).padStart(2, '0')}
          </span>
          <div className="min-w-0 pt-1.5">
            <p className="text-[16px] font-medium text-fg">{step.title}</p>
            <p className="mt-1.5 text-[13px] leading-5 text-fg-2">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function SetupGuideDialog() {
  const { open, connectionString, hide } = useSetupGuide();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && hide()} title="Record a Unity scene" context="Unity quickstart" width="md" display>
      <SetupSteps current={1} compact />
      {connectionString && (
        <div className="mt-7 space-y-2">
          <p className="eyebrow">Connection string</p>
          <CopyField value={connectionString} display={maskConnection(connectionString)} label="connection string" className="w-full" />
        </div>
      )}
      <div className="mt-8 flex justify-end">
        <Button onClick={hide}>Done</Button>
      </div>
    </Dialog>
  );
}
