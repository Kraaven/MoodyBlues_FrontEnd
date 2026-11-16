import { useEffect, useRef, useState } from 'react';
import { Collapsible, Dialog as D } from 'radix-ui';
import { ChevronDown, Play } from 'lucide-react';
import type { SharedSessionResponse } from '../api/types';
import { formatBytes, formatCaptured, formatDuration } from '../lib/format';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useStage } from '../stage/store';
import { navigationHints } from '../studio/navigationHints';
import type { RailTool, WindowDef } from '../studio/windows/WindowHost';
import { Button } from '../ui/Button';
import { versionLabel } from '../ui/Chip';
import { Mark, Wordmark } from '../ui/Logo';
import { Kbd } from '../ui/States';
import { cn } from '../ui/cn';
import { combinedProgress, playLabel, railGroups } from './welcome';

const OPEN_KEY = 'moodyblues.welcome.navigation.v1';

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) === 'open';
  } catch {
    return false;
  }
}

function storeOpen(open: boolean) {
  try {
    localStorage.setItem(OPEN_KEY, open ? 'open' : 'closed');
  } catch {
    /* not remembered */
  }
}

interface WelcomeCardProps {
  shared: SharedSessionResponse;
  /** Where the link starts, in seconds. */
  startTime: number;
  /** The scene and the replay are both loaded and attached. */
  ready: boolean;
  /** The replay file has downloaded and parsed (the scene's own state comes from the Stage). */
  replayLoaded: boolean;
  /** Play was pressed before everything was ready: wait here, then start by itself. */
  starting: boolean;
  /** Play, Esc and a click outside all mean this. */
  onPlay: () => void;
  /** The same windows and tools the rail shows, so the two cannot drift apart. */
  windows: readonly WindowDef[];
  tools: readonly RailTool[];
  phone: boolean;
}

/**
 * What a visitor sees first on a shared link: whose recording this is, how to move around, and a
 * Play button that is also the download progress. The scene loads behind it (see the intro gate in
 * the studio store). It has no close button: leaving it is playing.
 */
export function WelcomeCard({ shared, startTime, ready, replayLoaded, starting, onPlay, windows, tools, phone }: WelcomeCardProps) {
  const touch = useMediaQuery('(pointer: coarse)');
  const [guideOpen, setGuideOpen] = useState(readOpen);
  const playRef = useRef<HTMLButtonElement>(null);
  const sceneReady = useStage((s) => s.scene.status === 'ready');
  const sceneLoading = useStage((s) => s.loading.scene ?? null);
  const replayLoading = useStage((s) => s.loading.replay ?? null);

  // The card shows the downloads itself; the floating preloader would say the same thing twice.
  useEffect(() => {
    useStage.getState().setLoadingHidden(true);
    return () => useStage.getState().setLoadingHidden(false);
  }, []);

  const fraction = ready ? 1 : combinedProgress([
    { done: sceneReady, download: sceneLoading },
    { done: replayLoaded, download: replayLoading },
  ]);
  const running = sceneLoading ?? replayLoading;
  const detail = ready
    ? null
    : running
      ? `${running.label}${running.received > 0 ? ` · ${formatBytes(running.received)}${running.total ? ` / ${formatBytes(running.total)}` : ''}` : ''}`
      : 'Preparing the scene';

  const { session } = shared;
  const context = [
    shared.projectName,
    shared.sceneVersion !== null ? versionLabel(shared.sceneVersion) : null,
    formatDuration(session.durationSeconds),
    formatCaptured(session.createdAtUtc),
  ].filter(Boolean);

  const hints = navigationHints(touch);
  const groups = railGroups(windows, tools);
  const pending = !ready;

  const press = () => {
    if (!starting) onPlay();
  };

  return (
    <D.Root open onOpenChange={(open) => !open && press()}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-[60] animate-fade bg-[#0d0d0c]/40 backdrop-blur-[2px]" />
        <D.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            playRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className={cn(
            'elevated fixed z-[61] flex flex-col border border-rule-strong/70 bg-ink-2 focus:outline-none',
            phone
              ? 'inset-x-0 bottom-0 max-h-[calc(100dvh-16px)] animate-rise rounded-t-[var(--radius-dialog)] border-b-0'
              : 'left-1/2 top-1/2 max-h-[calc(100dvh-32px)] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-dialog)] data-[state=open]:animate-[dialog-in_260ms_var(--ease-out-soft)]',
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 pb-4">
            <span className="inline-flex items-center gap-2">
              <Mark className="text-[18px]" />
              <Wordmark className="text-[13px]" />
            </span>

            <D.Title className="display mt-5 text-[30px] leading-[36px] text-fg">{shared.sceneName}</D.Title>
            <p className="mt-1.5 font-mono text-[13px] text-fg-3">{context.join(' · ')}</p>
            <D.Description className="sr-only">A shared recording. Play it to watch from {startTime > 0 ? formatDuration(startTime) : 'the start'}.</D.Description>

            <div className="my-5 h-px bg-rule" />

            <Collapsible.Root open={guideOpen} onOpenChange={(open) => { setGuideOpen(open); storeOpen(open); }}>
              <Collapsible.Trigger className="group flex w-full items-center justify-between rounded-[var(--radius-control)] py-1 text-left text-[14px] font-medium text-fg-2 transition-colors hover:text-fg">
                How to navigate
                <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </Collapsible.Trigger>
              <Collapsible.Content className="overflow-hidden">
                <div className="max-h-[40dvh] space-y-6 overflow-y-auto pb-1 pt-4">
                  <section>
                    <p className="eyebrow mb-3">In the view</p>
                    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-2.5 text-[14px]">
                      {hints.map((hint) => (
                        <div key={hint.action} className="contents">
                          <dt className="flex min-w-[96px] flex-wrap items-center gap-1">
                            {hint.keys.map((key, i) => (
                              <span key={key} className="inline-flex items-center gap-1">
                                {hint.either && i > 0 && <span className="text-[12px] text-fg-3">or</span>}
                                <Kbd>{key}</Kbd>
                              </span>
                            ))}
                          </dt>
                          <dd className="text-fg-2">{hint.action}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                  <section>
                    <p className="eyebrow mb-3">{phone ? 'The toolbar' : 'The side toolbar'}</p>
                    <div className="space-y-3">
                      {groups.map((rows, gi) => (
                        <ul key={gi} className={cn('space-y-3', gi > 0 && 'border-t border-rule pt-3')}>
                          {rows.map((row) => (
                            <li key={row.id} className="flex items-start gap-3">
                              <row.icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-fg-2" strokeWidth={1.6} />
                              <span className="min-w-0">
                                <span className="block text-[14px] leading-5 text-fg">{row.title}</span>
                                <span className="block text-[13px] leading-[18px] text-fg-3">{row.description}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      ))}
                    </div>
                  </section>
                </div>
              </Collapsible.Content>
            </Collapsible.Root>
          </div>

          <div className="space-y-2.5 px-6 pb-6 pt-2">
            <Button
              ref={playRef}
              size="lg"
              className={cn('w-full overflow-hidden', pending && 'bg-ink-4! text-fg! shadow-none! hover:bg-ink-4!')}
              aria-disabled={starting}
              onClick={press}
            >
              {pending && (
                <span aria-hidden="true" className="absolute inset-0">
                  {fraction === null ? (
                    <span className="sweep absolute inset-0 bg-accent-deep/40" />
                  ) : (
                    <span className="absolute inset-y-0 left-0 bg-accent-deep transition-[width] duration-200" style={{ width: `${fraction * 100}%` }} />
                  )}
                </span>
              )}
              <span className="relative inline-flex items-center gap-2">
                <Play aria-hidden="true" className="h-4 w-4 fill-current" />
                {starting ? 'Starting…' : playLabel(startTime)}
                {starting && fraction !== null && <span className="tabular font-mono text-[13px] opacity-80">{Math.round(fraction * 100)}%</span>}
              </span>
            </Button>
            <p role="status" aria-live="polite" className="min-h-4 text-center font-mono text-[12px] leading-4 text-fg-3">
              {detail}
            </p>
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
