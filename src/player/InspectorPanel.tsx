import { useRef } from 'react';
import { Activity, Boxes, PanelRightClose, PanelRightOpen, ScrollText } from 'lucide-react';
import type { SessionDetail } from '../api/types';
import type { Replay } from '../viewer/replay/replayFile';
import { IconButton } from '../ui/Button';
import { SegmentTabs } from '../ui/Tabs';
import { formatCount } from '../lib/format';
import { usePlayerUi, type InspectorTab, type Playback } from './playback';
import { LogsTab } from './LogsTab';
import { ObjectsTab } from './ObjectsTab';
import { DetailsTab } from './DetailsTab';

const RAIL_TABS: { id: InspectorTab; label: string; icon: typeof ScrollText }[] = [
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'objects', label: 'Objects', icon: Boxes },
  { id: 'details', label: 'Details', icon: Activity },
];

/** The player's right-hand panel (DESIGN.md 7.6): resizable, collapsible to an icon rail. */
export function InspectorPanel({
  session,
  replay,
  playback,
  sceneHref,
}: {
  session: SessionDetail;
  replay: Replay | null;
  playback: Playback;
  sceneHref: string;
}) {
  const open = usePlayerUi((s) => s.inspectorOpen);
  const tab = usePlayerUi((s) => s.inspectorTab);
  const width = usePlayerUi((s) => s.inspectorWidth);
  const setOpen = usePlayerUi((s) => s.setInspectorOpen);
  const setTab = usePlayerUi((s) => s.setInspectorTab);
  const setWidth = usePlayerUi((s) => s.setInspectorWidth);
  const drag = useRef<{ x: number; width: number } | null>(null);

  if (!open) {
    return (
      <aside className="flex w-10 shrink-0 flex-col items-center gap-1 border-l border-line bg-surface-1 py-2">
        <IconButton label="Show the inspector" shortcut="\" size="sm" onClick={() => setOpen(true)}>
          <PanelRightOpen className="h-4 w-4" />
        </IconButton>
        <div className="my-1 h-px w-5 bg-line" />
        {RAIL_TABS.map((t) => (
          <IconButton key={t.id} label={t.label} size="sm" onClick={() => setTab(t.id)}>
            <t.icon className="h-4 w-4" />
          </IconButton>
        ))}
      </aside>
    );
  }

  const errors = replay?.logs.filter((l) => l.level === 3).length ?? 0;

  return (
    <aside className="relative flex shrink-0 flex-col border-l border-line bg-surface-1" style={{ width }}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the inspector"
        className="absolute -left-1 inset-y-0 z-10 w-2 cursor-col-resize hover:bg-accent/30"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, width };
        }}
        onPointerMove={(e) => drag.current && setWidth(drag.current.width + (drag.current.x - e.clientX))}
        onPointerUp={() => (drag.current = null)}
      />
      <div className="flex items-center gap-2 border-b border-line p-2">
        <SegmentTabs
          className="flex-1"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'logs', label: 'Logs', badge: replay ? (errors > 0 ? `${formatCount(errors)} err` : formatCount(replay.logs.length)) : undefined },
            { id: 'objects', label: 'Objects' },
            { id: 'details', label: 'Details' },
          ]}
        />
        <IconButton label="Collapse the inspector" shortcut="\" size="sm" onClick={() => setOpen(false)}>
          <PanelRightClose className="h-4 w-4" />
        </IconButton>
      </div>
      {tab === 'logs' &&
        (replay ? (
          <LogsTab logs={replay.logs} playback={playback} />
        ) : (
          <p className="p-4 text-[13px] text-fg-2">Logs appear here once the replay is built.</p>
        ))}
      {tab === 'objects' &&
        (replay ? <ObjectsTab playback={playback} /> : <p className="p-4 text-[13px] text-fg-2">Objects appear here once the replay is built.</p>)}
      {tab === 'details' && <DetailsTab session={session} replay={replay} sceneHref={sceneHref} sessionsHref={sceneHref} />}
    </aside>
  );
}
