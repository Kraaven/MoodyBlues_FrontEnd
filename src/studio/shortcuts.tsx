import { useEffect } from 'react';
import type { ReplayLog } from '../viewer/replay/replayFile';
import { nextLogTime, previousLogTime } from '../player/logNav';
import { SPEEDS, TICK_SECONDS, type Playback } from '../player/playback';
import { unityPath } from '../player/unityPath';
import { Dialog } from '../ui/Dialog';
import { Kbd } from '../ui/States';
import { useStudio } from './studioStore';
import { windowActions } from './windows/windowStore';

const GENERAL: [string[], string][] = [
  [['R'], 'Cinema on / off'],
  [['A'], 'Frame the whole scene'],
  [['Shift', 'F'], 'Frame the selection'],
  [['Esc'], 'Clear the selection'],
  [['C'], "Copy the selection's Unity path"],
  [['G'], 'Grid on / off'],
  [['Alt', '1–9'], 'Open the tool windows, in rail order'],
  [['\\'], 'Show / hide the dock'],
  [['?'], 'This list'],
];

const PLAYBACK: [string[], string][] = [
  [['Space', 'K'], 'Play / pause'],
  [['J', 'L'], 'Back / forward 5 s'],
  [['←', '→'], 'Back / forward 1 s'],
  [[',', '.'], 'One capture tick back / forward'],
  [['[', ']'], 'Previous / next log'],
  [['{', '}'], 'Previous / next error'],
  [['Home', 'End'], 'Start / end'],
  [['1', '5'], 'Speed 0.25× to 4×'],
  [['F'], 'Follow the selected object'],
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

// oxlint-disable-next-line react/only-export-components -- the hook and its help dialog share one table
export function useStudioShortcuts({
  scope,
  windows,
  playback,
  logs,
  onCinema,
}: {
  scope: string;
  windows: string[];
  playback: Playback | null;
  logs: readonly ReplayLog[];
  onCinema: () => void;
}) {
  const windowKey = windows.join(',');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      const studio = useStudio.getState();
      if (e.altKey) {
        const n = Number(e.key);
        const id = windowKey.split(',')[n - 1];
        if (!id || !Number.isInteger(n)) return;
        windowActions(scope).toggle(id);
        e.preventDefault();
        return;
      }
      const t = playback?.time ?? 0;
      const ready = Boolean(playback?.player);
      switch (e.key) {
        case 'r':
        case 'R':
          onCinema();
          break;
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
          void navigator.clipboard.writeText(unityPath(node, root)).catch(() => undefined);
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
              playback.seek(t - 5);
              break;
            case 'l':
            case 'L':
              playback.seek(t + 5);
              break;
            case 'ArrowLeft':
              playback.seek(t - 1);
              break;
            case 'ArrowRight':
              playback.seek(t + 1);
              break;
            case ',':
              playback.setPlaying(false);
              playback.seek(t - TICK_SECONDS);
              break;
            case '.':
              playback.setPlaying(false);
              playback.seek(t + TICK_SECONDS);
              break;
            case '[':
              playback.seek(previousLogTime(logs, t));
              break;
            case ']':
              playback.seek(nextLogTime(logs, t));
              break;
            case '{':
              playback.seek(previousLogTime(logs, t, true));
              break;
            case '}':
              playback.seek(nextLogTime(logs, t, true));
              break;
            case 'Home':
              playback.seek(0);
              break;
            case 'End':
              playback.seek(playback.duration);
              break;
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
              playback.setSpeed(SPEEDS[Number(e.key) - 1]);
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
  }, [scope, windowKey, playback, logs, onCinema]);
}

function Table({ title, rows }: { title: string; rows: [string[], string][] }) {
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

export function ShortcutsDialog({ playback }: { playback: boolean }) {
  const open = useStudio((s) => s.shortcutsOpen);
  const setOpen = useStudio((s) => s.setShortcutsOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Keyboard shortcuts" width="lg">
      <div className="grid gap-10 sm:grid-cols-2">
        <Table title="View" rows={GENERAL} />
        <Table title={playback ? 'Playback' : 'Playback (in a session)'} rows={PLAYBACK} />
      </div>
    </Dialog>
  );
}
