import { useEffect } from 'react';
import type { ReplayLog } from '../viewer/replay/replayFile';
import { panelActions } from '../panels/panelStore';
import { Dialog } from '../ui/Dialog';
import { Kbd } from '../ui/States';
import { SPEEDS, TICK_SECONDS, usePlayerUi, type Playback } from './playback';
import { nextLogTime, previousLogTime } from './logNav';
import { unityPath } from './unityPath';

/** DESIGN.md Section 12, in display order. */
const SHORTCUTS: [string[], string][] = [
  [['Space', 'K'], 'Play / pause'],
  [['J', 'L'], 'Back / forward 5 s'],
  [['←', '→'], 'Back / forward 1 s'],
  [[',', '.'], 'One capture tick back / forward'],
  [['[', ']'], 'Previous / next log'],
  [['{', '}'], 'Previous / next error'],
  [['Home', 'End'], 'Start / end'],
  [['1', '5'], 'Speed 0.25× to 4×'],
  [['A'], 'Frame the whole scene'],
  [['F'], 'Follow the selected object'],
  [['Esc'], 'Clear selection'],
  [['C'], "Copy the selected object's Unity path"],
  [['Alt', '1 to 4'], 'Open Logs, Objects, Details, Raw data'],
  [['P'], 'Show / hide labels on the rail'],
  [['\\'], 'Collapse / expand the dock'],
  [['?'], 'Show this list'],
];

/** Alt + digit opens a panel (DESIGN.md 15.1). */
const PANEL_KEYS: Record<string, string> = { '1': 'logs', '2': 'objects', '3': 'details', '4': 'raw' };

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

// oxlint-disable-next-line react/only-export-components -- the hook and its help dialog share one shortcut table
export function usePlayerShortcuts(playback: Playback, logs: readonly ReplayLog[], enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || isTyping(e.target)) return;
      const ui = usePlayerUi.getState();
      if (e.altKey) {
        const panel = PANEL_KEYS[e.key];
        if (!panel) return;
        panelActions('player').open(panel);
        e.preventDefault();
        return;
      }
      const t = playback.time;
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
        case 'a':
        case 'A':
          ui.frameAll();
          break;
        case 'f':
        case 'F':
          if (ui.selectedId !== null) ui.setFollow(!ui.follow);
          break;
        case 'Escape':
          if (ui.shortcutsOpen) return;
          ui.select(null);
          break;
        case '\\':
          panelActions('player').toggleDock();
          break;
        case 'p':
        case 'P':
          panelActions('player').toggleRail();
          break;
        case 'c':
        case 'C': {
          const player = playback.player;
          const node = ui.selectedId !== null ? player?.getObject(ui.selectedId) : undefined;
          if (!player || !node) return;
          void navigator.clipboard.writeText(unityPath(node, player.sceneRoot)).catch(() => undefined);
          break;
        }
        case '?':
          ui.setShortcutsOpen(true);
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playback, logs, enabled]);
}

export function ShortcutsDialog() {
  const open = usePlayerUi((s) => s.shortcutsOpen);
  const setOpen = usePlayerUi((s) => s.setShortcutsOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Keyboard shortcuts" width="md">
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2 text-[13px]">
        {SHORTCUTS.map(([keys, label]) => (
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
    </Dialog>
  );
}
