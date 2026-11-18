import { useEffect } from 'react';
import type { ReplayLog } from '../viewer/replay/replayFile';
import { nextLogTime, previousLogTime } from './logNav';
import { SPEEDS, TICK_SECONDS, type Playback } from './playback';
import { isLocked, type LockKey, type ShareSettings } from '../share/shareSettings';
import { seekByUser, setSpeedByUser } from './userActions';
import { listCameras } from './cameras';
import { unityPath } from './unityPath';
import { Dialog } from '../ui/Dialog';
import { Kbd } from '../ui/States';
import { useToast } from '../ui/Toast';
import { useStudio } from './studioStore';
import { windowActions } from './windows/windowStore';

/** A row of the shortcut table; `lock` names the value it changes, and the row is left out where the owner locked it. */
type Row = [keys: string[], label: string, lock?: LockKey];

const GENERAL: Row[] = [
  [['A'], 'Frame the whole scene', 'cameraTarget'],
  [['Shift', 'F'], 'Frame the selection', 'cameraTarget'],
  [['Esc'], 'Clear the selection'],
  [['C'], "Copy the selection's Unity path"],
  [['G'], 'Grid on / off', 'grid'],
  [['V'], 'Next exported camera', 'cameraTarget'],
  [['Shift', 'V'], 'Free camera', 'cameraTarget'],
  [['P'], 'First person / follow, on the focused camera', 'cameraMode'],
  [['Alt', '1–9, 0'], 'Open the tool windows, in rail order'],
  [['\\'], 'Show / hide the dock'],
  [['?'], 'This list'],
];

const PLAYBACK: Row[] = [
  [['Space', 'K'], 'Play / pause'],
  [['J', 'L'], 'Back / forward 5 s', 'seeking'],
  [['←', '→'], 'Back / forward 1 s', 'seeking'],
  [[',', '.'], 'One capture tick back / forward', 'seeking'],
  [['[', ']'], 'Previous / next log', 'seeking'],
  [['{', '}'], 'Previous / next error', 'seeking'],
  [['Home', 'End'], 'Start / end', 'seeking'],
  [['1', '5'], 'Speed 0.25× to 4×', 'speed'],
  [['F'], 'Follow the selected object', 'cameraTarget'],
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

/** A menu or dialog is open (Radix marks them with a role), so keys belong to it. */
function overlayOpen(target: EventTarget | null): boolean {
  if (target instanceof Element && target.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]')) return true;
  return document.querySelector('[role="menu"], [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]') !== null;
}

/** Alt+1..9 is windows 1-9 and Alt+0 the tenth, by physical key so Option+digit on a Mac works too. */
function windowIndex(code: string): number {
  const m = /^Digit(\d)$/.exec(code);
  if (!m) return -1;
  const d = Number(m[1]);
  return d === 0 ? 9 : d - 1;
}

// oxlint-disable-next-line react/only-export-components -- the hook and its help dialog share one table
export function useStudioShortcuts({
  scope,
  windows,
  playback,
  logs,
}: {
  scope: string;
  windows: string[];
  playback: Playback | null;
  logs: readonly ReplayLog[];
}) {
  const notify = useToast();
  const windowKey = windows.join(',');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || isTyping(e.target) || overlayOpen(e.target)) return;
      const studio = useStudio.getState();
      if (e.altKey) {
        const id = windowKey.split(',')[windowIndex(e.code)];
        if (!id) return;
        windowActions(scope).toggle(id);
        e.preventDefault();
        return;
      }
      const t = playback?.time ?? 0;
      const ready = Boolean(playback?.player);
      switch (e.key) {
        case 'a':
        case 'A':
          studio.frameAll();
          break;
        case 'F':
          if (e.shiftKey) studio.frameSelected();
          else if (ready && studio.selected) studio.setFollow(!studio.follow);
          else studio.frameSelected();
          break;
        case 'f':
          if (ready && studio.selected) studio.setFollow(!studio.follow);
          else studio.frameSelected();
          break;
        case 'v': {
          const cameras = studio.root ? listCameras(studio.root) : [];
          if (cameras.length === 0) return;
          const at = cameras.findIndex((c) => c.id === studio.focusCameraId);
          studio.setFocusCamera(cameras[(at + 1) % cameras.length].id);
          break;
        }
        case 'V':
          studio.setFocusCamera(null);
          break;
        case 'p':
        case 'P':
          if (studio.focusCameraId === null) return;
          studio.setCameraMode(studio.focusCameraId, studio.cameraMode === 'firstPerson' ? 'follow' : 'firstPerson');
          break;
        case 'g':
        case 'G':
          studio.setSetting('grid', !studio.settings.grid);
          break;
        case 'Escape':
          if (studio.shortcutsOpen) return;
          studio.select(null);
          break;
        case 'c':
        case 'C': {
          const node = studio.selected;
          const root = studio.player?.sceneRoot ?? studio.root;
          if (!node || !root) return;
          navigator.clipboard.writeText(unityPath(node, root)).then(
            () => notify('Unity path copied.'),
            () => notify('Could not copy the path.', 'error'),
          );
          break;
        }
        case '\\':
          windowActions(scope).toggleDock();
          break;
        case '?':
          studio.setShortcutsOpen(true);
          break;
        default: {
          if (!playback || !ready) return;
          switch (e.key) {
            case ' ':
            case 'k':
            case 'K':
              playback.toggle();
              break;
            case 'j':
            case 'J':
              seekByUser(playback, t - 5);
              break;
            case 'l':
            case 'L':
              seekByUser(playback, t + 5);
              break;
            case 'ArrowLeft':
              seekByUser(playback, t - 1);
              break;
            case 'ArrowRight':
              seekByUser(playback, t + 1);
              break;
            case ',':
              if (isLocked(studio.share, 'seeking')) return;
              playback.setPlaying(false);
              seekByUser(playback, t - TICK_SECONDS);
              break;
            case '.':
              if (isLocked(studio.share, 'seeking')) return;
              playback.setPlaying(false);
              seekByUser(playback, t + TICK_SECONDS);
              break;
            case '[':
              seekByUser(playback, previousLogTime(logs, t));
              break;
            case ']':
              seekByUser(playback, nextLogTime(logs, t));
              break;
            case '{':
              seekByUser(playback, previousLogTime(logs, t, true));
              break;
            case '}':
              seekByUser(playback, nextLogTime(logs, t, true));
              break;
            case 'Home':
              seekByUser(playback, 0);
              break;
            case 'End':
              seekByUser(playback, playback.duration);
              break;
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
              setSpeedByUser(playback, SPEEDS[Number(e.key) - 1]);
              break;
            default:
              return;
          }
        }
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scope, windowKey, playback, logs, notify]);
}

function Table({ title, rows }: { title: string; rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="eyebrow mb-3">{title}</p>
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2.5 text-[14px]">
        {rows.map(([keys, label]) => (
          <div key={label} className="contents">
            <dt className="flex gap-1">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </dt>
            <dd className="text-fg-2">{label}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** The rows that apply: not those that change a value the owner locked, nor the window keys when there are no windows. */
function visibleRows(rows: Row[], share: ShareSettings | null, windowCount: number): Row[] {
  return rows.filter(([keys, , lock]) => !(lock && isLocked(share, lock)) && !(keys[0] === 'Alt' && windowCount === 0));
}

export function ShortcutsDialog({ playback, windowCount }: { playback: boolean; windowCount: number }) {
  const open = useStudio((s) => s.shortcutsOpen);
  const setOpen = useStudio((s) => s.setShortcutsOpen);
  const share = useStudio((s) => s.share);
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Keyboard shortcuts" width="lg">
      <div className="grid gap-10 sm:grid-cols-2">
        <Table title="View" rows={visibleRows(GENERAL, share, windowCount)} />
        <Table title={playback ? 'Playback' : 'Playback (in a session)'} rows={visibleRows(PLAYBACK, share, windowCount)} />
      </div>
    </Dialog>
  );
}
