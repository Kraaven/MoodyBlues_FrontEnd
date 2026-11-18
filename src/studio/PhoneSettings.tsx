import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog as D } from 'radix-ui';
import { X } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { cn } from '../ui/cn';
import type { Replay } from '../viewer/replay/replayFile';
import { SPEEDS, usePlaybackState, type Playback } from './playback';
import { useLocked } from './studioStore';
import { setSpeedByUser } from './userActions';
import { buildLogRows } from './logRows';
import { LogList } from './windows/LogsWindow';
import { LockBadge, SectionTitle } from './windows/parts';
import { CameraTargets, DisplayToggles } from './windows/viewpointControls';

/** How far the sheet is dragged down before letting go closes it. */
const CLOSE_DRAG = 80;

/**
 * The phone's only panel: a bottom sheet with the camera, the playback speed, the display switches
 * and, when the owner made the logs available, a read-only list of them. It is the same controls
 * and the same guarded store actions as the tool windows, so a share link's locks hold here too.
 * It does not dim or block the view, so a change can be watched as it is made.
 */
export function PhoneSettings({
  open,
  onOpenChange,
  playback,
  replay,
  logsAvailable,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playback: Playback;
  replay: Replay | null;
  /** The logs panel is available to this viewer. */
  logsAvailable: boolean;
  /** What else the viewer can do from here: share a recording, or sign in. */
  actions?: ReactNode;
}) {
  const [drag, setDrag] = useState(0);
  const start = useRef<{ y: number; id: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (start.current) setDrag(Math.max(0, e.clientY - start.current.y));
  };
  const onPointerUp = () => {
    if (drag > CLOSE_DRAG) onOpenChange(false);
    start.current = null;
    setDrag(0);
  };

  return (
    <D.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <D.Portal>
        <D.Content
          // The view stays usable behind the sheet: only its own buttons and Esc close it.
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className={cn('elevated fixed inset-x-0 bottom-0 z-[62] mx-auto flex max-h-[70dvh] max-w-[640px] flex-col rounded-t-[16px] border border-b-0 border-rule-strong/70 bg-ink-2 focus:outline-none', drag === 0 && 'animate-rise')}
          style={{ transform: drag ? `translateY(${drag}px)` : undefined }}
        >
          <header
            className="relative flex h-12 shrink-0 touch-none select-none items-center justify-between border-b border-rule pl-5 pr-2"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-fg-3/50" />
            <D.Title className="text-[16px] font-medium text-fg">Settings</D.Title>
            <D.Description className="sr-only">Camera, playback speed, display options and logs.</D.Description>
            <D.Close asChild>
              <IconButton label="Close settings" size="sm">
                <X className="h-[18px] w-[18px]" />
              </IconButton>
            </D.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-3">
            <CameraTargets playback={playback} roomy />

            <SpeedPicker playback={playback} />

            <SectionTitle className="mb-1.5 mt-4">Display</SectionTitle>
            <DisplayToggles roomy />

            {logsAvailable && <PhoneLogs playback={playback} replay={replay} />}

            <p className="mt-5 text-[13px] leading-5 text-fg-3">For the full studio (hierarchy, inspector, materials and more), open this on a laptop.</p>
            {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
          </div>
          <div aria-hidden="true" className="shrink-0" style={{ height: 'env(safe-area-inset-bottom)' }} />
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** The playback speeds as one row of buttons, which a finger reaches faster than the timeline's menu. */
function SpeedPicker({ playback }: { playback: Playback }) {
  const { speed } = usePlaybackState(playback);
  const locked = useLocked('speed');
  return (
    <>
      <SectionTitle className="mb-1.5 mt-4 flex items-center gap-2">
        Playback speed
        {locked && <LockBadge />}
      </SectionTitle>
      <div role="radiogroup" aria-label="Playback speed" className="flex gap-0.5 rounded-[8px] bg-ink-1/70 p-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={speed === s}
            disabled={locked}
            onClick={() => setSpeedByUser(playback, s)}
            className={cn('tabular h-10 flex-1 rounded-[6px] font-mono text-[14px] transition-colors disabled:cursor-default', speed === s ? 'bg-accent/18 text-accent' : 'text-fg-2 hover:bg-ink-4 hover:text-fg')}
          >
            {s}×
          </button>
        ))}
      </div>
    </>
  );
}

/** Every log of the recording in order, the current one marked; a tap seeks unless the owner locked seeking. */
function PhoneLogs({ playback, replay }: { playback: Playback; replay: Replay | null }) {
  const seekLocked = useLocked('seeking');
  const rows = useMemo(() => (replay ? buildLogRows(replay) : []), [replay]);
  return (
    <>
      <SectionTitle className="mb-1.5 mt-4 flex items-center gap-2">
        Logs
        {seekLocked && <LockBadge />}
      </SectionTitle>
      {replay ? (
        <LogList rows={rows} total={rows.length} playback={playback} follow={false} className="h-60 rounded-[8px] border border-rule bg-ink-1/50 p-1" />
      ) : (
        <p className="text-[13px] leading-5 text-fg-2">The logs appear once the replay is built.</p>
      )}
    </>
  );
}
