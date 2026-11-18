import { Fragment, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ExternalLink, GripHorizontal, PanelRight, X } from 'lucide-react';
import { IconButton } from '../../ui/Button';
import { Tooltip } from '../../ui/Tooltip';
import { cn } from '../../ui/cn';
import { useWindowWidth } from '../../lib/useWindowWidth';
import { clampRect, dockWidthFor, fromFrame, isShown, toFrame, type FrameRect } from './windowLayout';
import { useWindowLayout, useWindows, windowActions } from './windowStore';

export interface WindowDef {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Rail buttons are grouped; a short rule separates the groups. */
  group: 'recordings' | 'scene' | 'view';
  shortcut?: string;
  /** One line on what the window shows, for the welcome card. */
  description?: string;
  render: () => ReactNode;
}

export interface RailTool {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  hint?: string;
  /** One line on what the tool does, for the welcome card. */
  description?: string;
}

/** A rail button: 40 px, and 36 on a short screen so every tool still fits the height. */
const RAIL_BUTTON = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] transition-colors duration-[140ms] [@media(max-height:720px)]:h-9 [@media(max-height:720px)]:w-9';

/** The tool rail: one icon per window, then a few view controls, floating at the right edge of the view. */
export function WindowRail({ scope, windows, tools = [], className }: { scope: string; windows: WindowDef[]; tools?: RailTool[]; className?: string }) {
  const layout = useWindowLayout(scope, windows.map((w) => w.id));
  const actions = windowActions(scope);
  const groups = (['recordings', 'scene', 'view'] as const).map((g) => windows.filter((w) => w.group === g)).filter((g) => g.length > 0);

  return (
    <nav aria-label="Tools" className={cn('glass elevated pointer-events-auto flex max-h-full flex-col gap-1 overflow-y-auto rounded-[12px] border border-rule-strong/60 p-1', className)}>
      {groups.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <RailDivider />}
          <div className="flex flex-col gap-1">
            {group.map((w) => {
              const shown = isShown(layout, w.id);
              return (
                <Tooltip key={w.id} side="left" content={w.shortcut ? `${w.title} (${w.shortcut})` : w.title}>
                  <button
                    type="button"
                    aria-label={w.title}
                    aria-pressed={shown}
                    onClick={() => actions.toggle(w.id)}
                    className={cn(RAIL_BUTTON, shown ? 'bg-accent/18 text-accent' : 'text-fg-2 hover:bg-ink-4 hover:text-fg')}
                  >
                    <w.icon className="h-[19px] w-[19px]" strokeWidth={1.6} />
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </Fragment>
      ))}
      {tools.length > 0 && (
        <>
          {groups.length > 0 && <RailDivider />}
          <div className="flex flex-col gap-1">
            {tools.map((tool) => (
              <Tooltip key={tool.id} side="left" content={tool.hint ? `${tool.label} (${tool.hint})` : tool.label}>
                <button
                  type="button"
                  aria-label={tool.label}
                  aria-pressed={tool.active}
                  onClick={tool.onClick}
                  className={cn(RAIL_BUTTON, tool.active ? 'bg-accent/18 text-accent' : 'text-fg-2 hover:bg-ink-4 hover:text-fg')}
                >
                  <tool.icon className="h-[19px] w-[19px]" strokeWidth={1.6} />
                </button>
              </Tooltip>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}

/** A quiet rule between rail groups, inset so it does not touch the rail's edges. */
function RailDivider() {
  return <div role="separator" aria-orientation="horizontal" className="mx-2.5 my-0.5 h-px shrink-0 bg-rule/60" />;
}

/** The window chrome shared by floating windows and the dock: a title, a grip, and its controls. */
function WindowHeader({
  title,
  onClose,
  onToggleDock,
  docked,
  grip,
  dragProps,
}: {
  title: ReactNode;
  onClose: () => void;
  onToggleDock?: () => void;
  docked: boolean;
  grip: boolean;
  dragProps?: React.HTMLAttributes<HTMLElement>;
}) {
  return (
    <header
      {...dragProps}
      className={cn(
        'relative flex h-[52px] shrink-0 select-none items-center gap-2 border-b border-rule bg-ink-3/70 pl-5 pr-2',
        grip && 'cursor-grab touch-none active:cursor-grabbing',
      )}
    >
      <div className="min-w-0 flex-1 truncate text-[16px] font-medium text-fg">{title}</div>
      {grip && <GripHorizontal aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-fg-3/70" />}
      {onToggleDock && (
        <IconButton label={docked ? 'Float this window' : 'Dock to the side'} size="sm" onClick={onToggleDock}>
          {docked ? <ExternalLink className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
        </IconButton>
      )}
      <IconButton label="Close" size="sm" onClick={onClose}>
        <X className="h-[18px] w-[18px]" />
      </IconButton>
    </header>
  );
}

/** Floating windows, over the 3D view. */
export function FloatingWindows({ scope, windows }: { scope: string; windows: WindowDef[] }) {
  const layout = useWindowLayout(scope, windows.map((w) => w.id));
  const ref = useRef<HTMLDivElement>(null);
  const bounds = useWindows((s) => s.bounds);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => useWindows.getState().setBounds({ w: Math.round(entry.contentRect.width), h: Math.round(entry.contentRect.height) }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const open = layout.open.map((id) => windows.find((w) => w.id === id)).filter((w): w is WindowDef => Boolean(w));

  return (
    <div ref={ref} className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {open.map((w, z) => (
        <FloatingWindow key={w.id} scope={scope} window={w} rect={layout.rects[w.id] ? toFrame(layout.rects[w.id], bounds) : { x: 24, y: 120, w: 380, h: 520 }} bounds={bounds} z={z} />
      ))}
    </div>
  );
}

const STEP = 16;

function FloatingWindow({ scope, window: w, rect, bounds, z }: { scope: string; window: WindowDef; rect: FrameRect; bounds: { w: number; h: number }; z: number }) {
  const actions = windowActions(scope);
  const [live, setLive] = useState<FrameRect | null>(null);
  const gesture = useRef<{ kind: 'move' | 'resize'; x: number; y: number; start: FrameRect } | null>(null);
  const shown = live ?? rect;

  const begin = (kind: 'move' | 'resize') => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    gesture.current = { kind, x: e.clientX, y: e.clientY, start: rect };
    actions.focus(w.id);
  };
  const track = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    setLive(clampRect(g.kind === 'move' ? { ...g.start, x: g.start.x + dx, y: g.start.y + dy } : { ...g.start, w: g.start.w + dx, h: g.start.h + dy }, bounds));
  };
  const end = () => {
    if (gesture.current && live) actions.move(w.id, fromFrame(live, bounds));
    gesture.current = null;
    setLive(null);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!e.altKey) return;
    const delta = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] }[e.key];
    if (!delta) return;
    e.preventDefault();
    actions.move(w.id, fromFrame(clampRect(e.shiftKey ? { ...rect, w: rect.w + delta[0], h: rect.h + delta[1] } : { ...rect, x: rect.x + delta[0], y: rect.y + delta[1] }, bounds), bounds));
  };

  return (
    <section
      aria-label={`${w.title} window`}
      onPointerDown={() => actions.focus(w.id)}
      onKeyDown={onKeyDown}
      className={cn(
        'elevated pointer-events-auto absolute flex animate-[window-in_220ms_var(--ease-out-soft)] flex-col overflow-hidden rounded-[12px] border border-rule-strong/60 bg-ink-1',
        live && 'shadow-[0_30px_60px_-12px_rgb(0_0_0/0.7)]',
      )}
      style={{ left: shown.x, top: shown.y, width: shown.w, height: shown.h, zIndex: z + 1 }}
    >
      <WindowHeader
        title={w.title}
        grip
        docked={false}
        onClose={() => actions.close(w.id)}
        onToggleDock={() => actions.dock(w.id)}
        dragProps={{
          tabIndex: 0,
          'aria-label': `${w.title}. Alt+arrows move this window, Alt+Shift+arrows resize it.`,
          onPointerDown: begin('move'),
          onPointerMove: track,
          onPointerUp: end,
          onPointerCancel: end,
        }}
      />
      <div className="flex min-h-0 flex-1 flex-col">{w.render()}</div>
      <div role="presentation" onPointerDown={begin('resize')} onPointerMove={track} onPointerUp={end} onPointerCancel={end} className="absolute bottom-0 right-0 h-5 w-5 cursor-nwse-resize touch-none">
        <svg viewBox="0 0 16 16" className="h-5 w-5 text-fg-3/70" aria-hidden="true">
          <path d="M13 7L7 13M13 10.5L10.5 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    </section>
  );
}

/** The dock: a column at the right edge holding windows as tabs. */
export function WindowDock({ scope, windows }: { scope: string; windows: WindowDef[] }) {
  const layout = useWindowLayout(scope, windows.map((w) => w.id));
  const actions = windowActions(scope);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const docked = layout.docked.map((id) => windows.find((w) => w.id === id)).filter((w): w is WindowDef => Boolean(w));
  const active = docked.find((w) => w.id === layout.dockActive) ?? docked[0];
  const open = layout.dockOpen && Boolean(active);
  const width = dockWidthFor(layout.dockWidth, useWindowWidth());

  return (
    <aside
      aria-label="Docked windows"
      aria-hidden={!open}
      style={{ width: open ? width : 0 }}
      className={cn('relative h-full shrink-0 overflow-hidden transition-[width] duration-[320ms] ease-[var(--ease-out-soft)]', !open && 'pointer-events-none')}
    >
      <div className="absolute inset-y-0 left-0 flex flex-col border-l border-rule-strong/60 bg-ink-1 backdrop-blur-md" style={{ width }}>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the dock"
          tabIndex={open ? 0 : -1}
          className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-accent/30 focus-visible:bg-accent/30"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, width };
          }}
          onPointerMove={(e) => drag.current && actions.setDockWidth(drag.current.width + (drag.current.x - e.clientX))}
          onPointerUp={() => (drag.current = null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') actions.setDockWidth(width + 16);
            else if (e.key === 'ArrowRight') actions.setDockWidth(width - 16);
            else return;
            e.preventDefault();
          }}
        />
        {active && (
          <>
            <WindowHeader
              docked
              grip={false}
              onClose={() => actions.close(active.id)}
              onToggleDock={() => actions.float(active.id)}
              title={
                docked.length === 1 ? (
                  active.title
                ) : (
                  <div role="tablist" className="-ml-1 flex gap-1 overflow-x-auto">
                    {docked.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        role="tab"
                        aria-selected={w.id === active.id}
                        onClick={() => actions.setDockActive(w.id)}
                        className={cn(
                          'h-8 shrink-0 rounded-[6px] px-2.5 text-[14px] transition-colors',
                          w.id === active.id ? 'bg-ink-4 text-fg' : 'text-fg-3 hover:text-fg',
                        )}
                      >
                        {w.title}
                      </button>
                    ))}
                  </div>
                )
              }
            />
            <div className="flex min-h-0 flex-1 flex-col">{active.render()}</div>
          </>
        )}
      </div>
    </aside>
  );
}
