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

/** The numbered steps, joined by a line. Shown inline on an empty project and in the connection dialog. */
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

